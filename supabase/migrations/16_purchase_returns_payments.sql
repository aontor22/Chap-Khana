-- Chap Khana v3.17.0 — immutable supplier payments and goods returns.
-- Requires purchasing migration 15. Additive; does not alter previous receipts,
-- historical order totals or coupon/loyalty ledgers. Test on staging first.
BEGIN;
DO $prereq$ BEGIN
 IF to_regclass('public.purchase_orders') IS NULL
   OR to_regclass('public.purchase_receipt_lines') IS NULL
   OR to_regclass('public.inventory_ingredients') IS NULL
   OR to_regprocedure('public.purchase_receive(uuid,uuid,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Apply purchase migration 15 before migration 16';
 END IF;
END $prereq$;

CREATE TABLE IF NOT EXISTS public.purchase_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
 receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL UNIQUE,
 request_payload jsonb NOT NULL,
 reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 300),
 recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.purchase_return_lines (
 return_id uuid NOT NULL REFERENCES public.purchase_returns(id) ON DELETE RESTRICT,
 receipt_id uuid NOT NULL,
 order_line_id uuid NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK (quantity > 0 AND quantity <= 1000000),
 unit_cost_snapshot numeric(12,2) NOT NULL CHECK (unit_cost_snapshot >= 0),
 PRIMARY KEY(return_id,order_line_id),
 FOREIGN KEY(receipt_id,order_line_id)
   REFERENCES public.purchase_receipt_lines(receipt_id,order_line_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS purchase_returns_order_idx ON public.purchase_returns(order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_return_lines_receipt_idx ON public.purchase_return_lines(receipt_id,order_line_id);

CREATE TABLE IF NOT EXISTS public.purchase_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL UNIQUE,
 amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 10000000),
 payment_method text NOT NULL CHECK (payment_method IN ('cash','bank','bkash','nagad','other')),
 reference text NOT NULL DEFAULT '' CHECK (length(reference) <= 120),
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 300),
 paid_on date NOT NULL DEFAULT CURRENT_DATE,
 recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_payments_order_idx ON public.purchase_payments(order_id,created_at DESC);

ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_return_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_returns,public.purchase_return_lines,public.purchase_payments
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.purchase_returns,public.purchase_return_lines,public.purchase_payments TO authenticated;
DROP POLICY IF EXISTS purchase_returns_staff_select ON public.purchase_returns;
CREATE POLICY purchase_returns_staff_select ON public.purchase_returns FOR SELECT TO authenticated
 USING ((SELECT private.is_staff()));
DROP POLICY IF EXISTS purchase_return_lines_staff_select ON public.purchase_return_lines;
CREATE POLICY purchase_return_lines_staff_select ON public.purchase_return_lines FOR SELECT TO authenticated
 USING ((SELECT private.is_staff()));
DROP POLICY IF EXISTS purchase_payments_staff_select ON public.purchase_payments;
CREATE POLICY purchase_payments_staff_select ON public.purchase_payments FOR SELECT TO authenticated
 USING ((SELECT private.is_staff()));
-- No INSERT/UPDATE/DELETE permissions to browser clients. Financial rows are append-only.

-- One ledger reading function. This is purchase liability, NOT general accounting or bank reconciliation.
CREATE OR REPLACE FUNCTION public.purchase_financial_summary(p_order_ids uuid[])
RETURNS TABLE(order_id uuid,received_value numeric,returned_value numeric,paid_value numeric,
              outstanding_value numeric,supplier_credit numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF p_order_ids IS NULL OR coalesce(array_length(p_order_ids,1),0) NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'Financial summary requires 1-50 purchase order IDs'; END IF;
 RETURN QUERY
 WITH recv AS (
  SELECT pr.order_id, sum(prl.quantity * prl.unit_cost_snapshot) AS amount
  FROM public.purchase_receipts pr
  JOIN public.purchase_receipt_lines prl ON prl.receipt_id=pr.id
  GROUP BY pr.order_id
 ), ret AS (
  SELECT r.order_id, sum(rl.quantity * rl.unit_cost_snapshot) AS amount
  FROM public.purchase_returns r
  JOIN public.purchase_return_lines rl ON rl.return_id=r.id
  GROUP BY r.order_id
 ), pay AS (
  SELECT p.order_id,sum(p.amount) AS amount
  FROM public.purchase_payments p GROUP BY p.order_id
 )
 SELECT po.id,
  coalesce(recv.amount,0)::numeric,coalesce(ret.amount,0)::numeric,coalesce(pay.amount,0)::numeric,
  greatest(0,coalesce(recv.amount,0)-coalesce(ret.amount,0)-coalesce(pay.amount,0))::numeric,
  greatest(0,coalesce(ret.amount,0)+coalesce(pay.amount,0)-coalesce(recv.amount,0))::numeric
 FROM public.purchase_orders po
 LEFT JOIN recv ON recv.order_id=po.id
 LEFT JOIN ret ON ret.order_id=po.id
 LEFT JOIN pay ON pay.order_id=po.id
 WHERE po.id = ANY(p_order_ids);
END; $$;

-- Return only real received goods, not PO commitments. Same PO row lock serializes
-- returns and payments; UPDATE ... WHERE on_hand>=quantity serializes with checkouts.
CREATE OR REPLACE FUNCTION public.purchase_return_goods(
 p_receipt uuid,p_request uuid,p_reason text,p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order uuid; v_existing record; v_return uuid; v_row record; v_line record;
 v_line_id uuid; v_qty numeric; v_returned numeric; v_updated uuid;
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF p_receipt IS NULL OR p_request IS NULL OR p_lines IS NULL OR
    pg_catalog.jsonb_typeof(p_lines)<>'array' OR
    pg_catalog.jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50 OR
    length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 300 THEN
   RAISE EXCEPTION 'Invalid supplier return';
 END IF;
 SELECT r.order_id INTO v_order FROM public.purchase_receipts r WHERE r.id=p_receipt;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown goods receipt'; END IF;
 PERFORM 1 FROM public.purchase_orders WHERE id=v_order FOR UPDATE;
 SELECT id,receipt_id,reason,request_payload INTO v_existing
 FROM public.purchase_returns WHERE request_id=p_request;
 IF FOUND THEN
   IF v_existing.receipt_id=p_receipt AND v_existing.reason=trim(p_reason) AND
      v_existing.request_payload=p_lines THEN RETURN v_existing.id; END IF;
   RAISE EXCEPTION 'Return request ID already used with different data';
 END IF;
 IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(p_lines)) <>
    (SELECT count(DISTINCT value->>'order_line_id') FROM pg_catalog.jsonb_array_elements(p_lines)) THEN
    RAISE EXCEPTION 'Duplicate return line'; END IF;
 -- Validate all requested quantities against the ORIGINAL receipt (not the PO).
 FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
   IF pg_catalog.jsonb_typeof(v_row.value)<>'object' OR
      coalesce(v_row.value->>'order_line_id','') !~ '^[0-9a-fA-F-]{36}$' OR
      coalesce(v_row.value->>'quantity','') !~ '^[0-9]+(\.[0-9]{1,3})?$' THEN
     RAISE EXCEPTION 'Invalid goods return line'; END IF;
   v_line_id:=(v_row.value->>'order_line_id')::uuid;
   v_qty:=(v_row.value->>'quantity')::numeric;
   SELECT rl.quantity AS received_qty, rl.unit_cost_snapshot AS unit_cost,
          pol.ingredient_id,i.unit
     INTO v_line
     FROM public.purchase_receipt_lines rl
     JOIN public.purchase_order_lines pol ON pol.id=rl.order_line_id
     JOIN public.inventory_ingredients i ON i.id=pol.ingredient_id
     WHERE rl.receipt_id=p_receipt AND rl.order_line_id=v_line_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Goods not present in this receipt'; END IF;
   SELECT coalesce(sum(quantity),0) INTO v_returned
   FROM public.purchase_return_lines WHERE receipt_id=p_receipt AND order_line_id=v_line_id;
   IF v_qty NOT BETWEEN 0.001 AND 1000000 OR v_qty+v_returned>v_line.received_qty THEN
     RAISE EXCEPTION 'Return exceeds unreturned received quantity'; END IF;
   IF v_line.unit='piece' AND v_qty<>trunc(v_qty) THEN
     RAISE EXCEPTION 'Piece returns require whole units'; END IF;
 END LOOP;
 INSERT INTO public.purchase_returns(order_id,receipt_id,request_id,request_payload,reason,recorded_by)
 VALUES(v_order,p_receipt,p_request,p_lines,trim(p_reason),auth.uid()) RETURNING id INTO v_return;
 FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) ORDER BY value->>'order_line_id' LOOP
   v_line_id:=(v_row.value->>'order_line_id')::uuid;
   v_qty:=(v_row.value->>'quantity')::numeric;
   SELECT pol.ingredient_id, rl.unit_cost_snapshot INTO v_line
   FROM public.purchase_receipt_lines rl
   JOIN public.purchase_order_lines pol ON pol.id=rl.order_line_id
   WHERE rl.receipt_id=p_receipt AND rl.order_line_id=v_line_id;
   -- Stock may already have been used in recipes/other orders: never permit negative stock.
   UPDATE public.inventory_ingredients SET on_hand=on_hand-v_qty
   WHERE id=v_line.ingredient_id AND on_hand>=v_qty RETURNING id INTO v_updated;
   IF v_updated IS NULL THEN RAISE EXCEPTION 'Insufficient on-hand stock for this supplier return'; END IF;
   INSERT INTO public.purchase_return_lines(return_id,receipt_id,order_line_id,quantity,unit_cost_snapshot)
   VALUES(v_return,p_receipt,v_line_id,v_qty,v_line.unit_cost_snapshot);
   INSERT INTO public.inventory_movements(resource_type,resource_id,delta,reason,actor_id)
   VALUES('ingredient',v_line.ingredient_id::text,-v_qty,'Supplier return '||left(v_return::text,8),auth.uid());
 END LOOP;
 RETURN v_return;
END; $$;

-- Record actual outgoing payments; no invented paid status from purchase orders.
-- Prevent overpayment; already-paid returns become a separately reported supplier credit.
CREATE OR REPLACE FUNCTION public.purchase_record_payment(
 p_order uuid,p_request uuid,p_amount numeric,p_method text,
 p_reference text,p_notes text,p_paid_on date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_existing record; v_payment uuid; v_receipts numeric; v_returns numeric; v_paid numeric;
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF p_order IS NULL OR p_request IS NULL OR p_amount IS NULL OR p_method IS NULL OR
   p_amount<=0 OR p_amount>10000000 OR p_amount<>round(p_amount,2) OR
   p_method NOT IN ('cash','bank','bkash','nagad','other') OR
   length(coalesce(p_reference,''))>120 OR length(coalesce(p_notes,''))>300 OR
   p_paid_on IS NULL OR p_paid_on>(now() AT TIME ZONE 'Asia/Dhaka')::date THEN
   RAISE EXCEPTION 'Invalid supplier payment';
 END IF;
 PERFORM 1 FROM public.purchase_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown purchase order'; END IF;
 SELECT id,order_id,amount,payment_method,reference,notes,paid_on INTO v_existing
 FROM public.purchase_payments WHERE request_id=p_request;
 IF FOUND THEN
   IF v_existing.order_id=p_order AND v_existing.amount=p_amount AND
      v_existing.payment_method=p_method AND v_existing.reference=coalesce(p_reference,'') AND
      v_existing.notes=coalesce(p_notes,'') AND v_existing.paid_on=p_paid_on THEN RETURN v_existing.id; END IF;
   RAISE EXCEPTION 'Payment request ID already used with different data';
 END IF;
 SELECT coalesce(sum(rl.quantity * rl.unit_cost_snapshot),0) INTO v_receipts
 FROM public.purchase_receipts r JOIN public.purchase_receipt_lines rl ON rl.receipt_id=r.id
 WHERE r.order_id=p_order;
 SELECT coalesce(sum(rl.quantity * rl.unit_cost_snapshot),0) INTO v_returns
 FROM public.purchase_returns r JOIN public.purchase_return_lines rl ON rl.return_id=r.id
 WHERE r.order_id=p_order;
 SELECT coalesce(sum(amount),0) INTO v_paid FROM public.purchase_payments WHERE order_id=p_order;
 IF p_amount>v_receipts-v_returns-v_paid THEN
   RAISE EXCEPTION 'Payment exceeds outstanding received goods value'; END IF;
 INSERT INTO public.purchase_payments(order_id,request_id,amount,payment_method,reference,notes,paid_on,recorded_by)
 VALUES(p_order,p_request,p_amount,p_method,coalesce(p_reference,''),coalesce(p_notes,''),p_paid_on,auth.uid())
 RETURNING id INTO v_payment;
 RETURN v_payment;
END; $$;

REVOKE ALL ON FUNCTION public.purchase_financial_summary(uuid[]),
 public.purchase_return_goods(uuid,uuid,text,jsonb),
 public.purchase_record_payment(uuid,uuid,numeric,text,text,text,date)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_financial_summary(uuid[]),
 public.purchase_return_goods(uuid,uuid,text,jsonb),
 public.purchase_record_payment(uuid,uuid,numeric,text,text,text,date) TO authenticated;
COMMIT;
