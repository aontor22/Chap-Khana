-- Chap Khana v3.16.0: supplier directory, purchase orders and auditable receiving.
-- Requires migration 14; no existing rows are modified by this migration.
-- Run in staging first. All quantities use the ingredient's native stock unit.
BEGIN;
DO $prereq$ BEGIN
 IF to_regclass('public.inventory_ingredients') IS NULL OR to_regclass('public.inventory_movements') IS NULL
    OR to_regprocedure('public.inventory_adjust_stock(text,text,numeric,text)') IS NULL THEN
   RAISE EXCEPTION 'Run inventory migration 14 before supplier purchasing migration 15';
 END IF;
END $prereq$;

CREATE TABLE IF NOT EXISTS public.purchase_suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),
 phone text NOT NULL DEFAULT '' CHECK(length(phone)<=40),
 email text NOT NULL DEFAULT '' CHECK(length(email)<=200),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=500),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.purchase_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 supplier_id uuid NOT NULL REFERENCES public.purchase_suppliers(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ordered','partially_received','received','cancelled')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=500),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_orders_recent_idx ON public.purchase_orders(created_at DESC);
CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
 ingredient_id uuid NOT NULL REFERENCES public.inventory_ingredients(id) ON DELETE RESTRICT,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0 AND quantity<=1000000),
 received_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK(received_qty>=0 AND received_qty<=quantity),
 unit_cost numeric(12,2) NOT NULL CHECK(unit_cost>=0 AND unit_cost<=10000000),
 UNIQUE(order_id,ingredient_id)
);
CREATE INDEX IF NOT EXISTS purchase_lines_order_idx ON public.purchase_order_lines(order_id);
CREATE TABLE IF NOT EXISTS public.purchase_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL UNIQUE,
 request_payload jsonb NOT NULL,
 received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.purchase_receipt_lines (
 receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE RESTRICT,
 order_line_id uuid NOT NULL REFERENCES public.purchase_order_lines(id) ON DELETE RESTRICT,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0 AND quantity<=1000000),
 unit_cost_snapshot numeric(12,2) NOT NULL CHECK(unit_cost_snapshot>=0),
 PRIMARY KEY(receipt_id,order_line_id)
);

ALTER TABLE public.purchase_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_suppliers,public.purchase_orders,public.purchase_order_lines,
 public.purchase_receipts,public.purchase_receipt_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.purchase_suppliers,public.purchase_orders,public.purchase_order_lines,
 public.purchase_receipts,public.purchase_receipt_lines TO authenticated;
GRANT INSERT(name,phone,email,notes,active) ON public.purchase_suppliers TO authenticated;
GRANT UPDATE(name,phone,email,notes,active) ON public.purchase_suppliers TO authenticated;

DROP POLICY IF EXISTS purchase_suppliers_staff_read ON public.purchase_suppliers;
CREATE POLICY purchase_suppliers_staff_read ON public.purchase_suppliers FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
DROP POLICY IF EXISTS purchase_suppliers_staff_insert ON public.purchase_suppliers;
CREATE POLICY purchase_suppliers_staff_insert ON public.purchase_suppliers FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_staff()));
DROP POLICY IF EXISTS purchase_suppliers_staff_update ON public.purchase_suppliers;
CREATE POLICY purchase_suppliers_staff_update ON public.purchase_suppliers FOR UPDATE TO authenticated
 USING ((SELECT private.is_staff())) WITH CHECK ((SELECT private.is_staff()));
DROP POLICY IF EXISTS purchase_orders_staff_read ON public.purchase_orders;
CREATE POLICY purchase_orders_staff_read ON public.purchase_orders FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
DROP POLICY IF EXISTS purchase_order_lines_staff_read ON public.purchase_order_lines;
CREATE POLICY purchase_order_lines_staff_read ON public.purchase_order_lines FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
DROP POLICY IF EXISTS purchase_receipts_staff_read ON public.purchase_receipts;
CREATE POLICY purchase_receipts_staff_read ON public.purchase_receipts FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
DROP POLICY IF EXISTS purchase_receipt_lines_staff_read ON public.purchase_receipt_lines;
CREATE POLICY purchase_receipt_lines_staff_read ON public.purchase_receipt_lines FOR SELECT TO authenticated USING ((SELECT private.is_staff()));

-- Create a draft order and immutable priced lines in ONE transaction.
CREATE OR REPLACE FUNCTION public.purchase_create_order(p_supplier uuid,p_notes text,p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order uuid; v_row record; v_id uuid; v_qty numeric; v_cost numeric; v_unit text;
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF p_supplier IS NULL OR NOT EXISTS(SELECT 1 FROM public.purchase_suppliers WHERE id=p_supplier AND active) THEN
   RAISE EXCEPTION 'Select an active supplier'; END IF;
 IF length(coalesce(p_notes,''))>500 THEN RAISE EXCEPTION 'Notes too long'; END IF;
 IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array' THEN
   RAISE EXCEPTION 'Purchase order must contain an ingredient array'; END IF;
 IF pg_catalog.jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50 THEN
   RAISE EXCEPTION 'Purchase order requires 1-50 ingredient lines'; END IF;
 IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(p_lines)) <>
    (SELECT count(DISTINCT value->>'ingredient_id') FROM pg_catalog.jsonb_array_elements(p_lines)) THEN
   RAISE EXCEPTION 'Duplicate ingredients in purchase order'; END IF;
 -- Validate before creating a purchase order.
 FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
   IF pg_catalog.jsonb_typeof(v_row.value)<>'object' OR
     coalesce(v_row.value->>'ingredient_id','') !~ '^[0-9a-fA-F-]{36}$' OR
     coalesce(v_row.value->>'quantity','') !~ '^[0-9]+(\.[0-9]{1,3})?$' OR
     coalesce(v_row.value->>'unit_cost','') !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
       RAISE EXCEPTION 'Invalid purchase line'; END IF;
   v_id:=(v_row.value->>'ingredient_id')::uuid;
   v_qty:=(v_row.value->>'quantity')::numeric;
   v_cost:=(v_row.value->>'unit_cost')::numeric;
   IF v_qty NOT BETWEEN 0.001 AND 1000000 OR v_cost NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid quantity or unit cost'; END IF;
   SELECT unit INTO v_unit FROM public.inventory_ingredients WHERE id=v_id AND active;
   IF NOT FOUND THEN RAISE EXCEPTION 'Ingredient is inactive or missing'; END IF;
   IF v_unit='piece' AND v_qty<>trunc(v_qty) THEN RAISE EXCEPTION 'Piece quantities must be whole numbers'; END IF;
 END LOOP;
 INSERT INTO public.purchase_orders(supplier_id,notes,created_by)
 VALUES(p_supplier,coalesce(p_notes,''),auth.uid()) RETURNING id INTO v_order;
 INSERT INTO public.purchase_order_lines(order_id,ingredient_id,quantity,unit_cost)
 SELECT v_order,(value->>'ingredient_id')::uuid,(value->>'quantity')::numeric,(value->>'unit_cost')::numeric
 FROM pg_catalog.jsonb_array_elements(p_lines);
 RETURN v_order;
END; $$;

CREATE OR REPLACE FUNCTION public.purchase_change_status(p_order uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_status text;
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 SELECT status INTO v_status FROM public.purchase_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
 IF NOT ((v_status='draft' AND p_status IN ('ordered','cancelled')) OR
         (v_status='ordered' AND p_status='cancelled')) THEN
   RAISE EXCEPTION 'Invalid purchase status transition'; END IF;
 UPDATE public.purchase_orders SET status=p_status,updated_at=now() WHERE id=p_order;
END; $$;

-- Idempotent, transactional partial/full receiving. Locks the purchase order first.
-- Ingredient balances and inventory_movements are written by the same transaction,
-- never by a direct browser write. A retried request_id cannot double-restock.
CREATE OR REPLACE FUNCTION public.purchase_receive(p_order uuid,p_request uuid,p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_status text; v_existing record; v_receipt uuid; v_row record; v_line record;
 v_line_id uuid; v_qty numeric; v_unit text;
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF p_order IS NULL OR p_request IS NULL OR p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array' THEN
   RAISE EXCEPTION 'Invalid goods receipt'; END IF;
 IF pg_catalog.jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Receipt requires 1-50 lines'; END IF;
 SELECT status INTO v_status FROM public.purchase_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
 SELECT id,order_id,request_payload INTO v_existing FROM public.purchase_receipts WHERE request_id=p_request;
 IF FOUND THEN
   IF v_existing.order_id=p_order AND v_existing.request_payload=p_lines THEN RETURN v_existing.id; END IF;
   RAISE EXCEPTION 'Receipt request ID already used with different data';
 END IF;
 IF v_status NOT IN ('ordered','partially_received') THEN RAISE EXCEPTION 'Purchase order cannot receive stock'; END IF;
 IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(p_lines)) <>
    (SELECT count(DISTINCT value->>'line_id') FROM pg_catalog.jsonb_array_elements(p_lines)) THEN
    RAISE EXCEPTION 'Duplicate purchase receipt line'; END IF;
 -- One PO lock serializes receiving and keeps quantity checks atomic.
 FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
   IF pg_catalog.jsonb_typeof(v_row.value)<>'object' OR
     coalesce(v_row.value->>'line_id','') !~ '^[0-9a-fA-F-]{36}$' OR
     coalesce(v_row.value->>'quantity','') !~ '^[0-9]+(\.[0-9]{1,3})?$' THEN
     RAISE EXCEPTION 'Invalid receipt line'; END IF;
   v_line_id:=(v_row.value->>'line_id')::uuid;
   v_qty:=(v_row.value->>'quantity')::numeric;
   SELECT l.id,l.quantity,l.received_qty,l.ingredient_id,l.unit_cost,i.unit INTO v_line
   FROM public.purchase_order_lines l
   JOIN public.inventory_ingredients i ON i.id=l.ingredient_id
   WHERE l.id=v_line_id AND l.order_id=p_order FOR UPDATE OF l;
   IF NOT FOUND THEN RAISE EXCEPTION 'Unknown purchase line'; END IF;
   IF v_qty<=0 OR v_qty>1000000 OR v_line.received_qty+v_qty>v_line.quantity THEN
     RAISE EXCEPTION 'Receipt exceeds outstanding purchase quantity'; END IF;
   IF v_line.unit='piece' AND v_qty<>trunc(v_qty) THEN RAISE EXCEPTION 'Piece quantities must be whole numbers'; END IF;
 END LOOP;
 INSERT INTO public.purchase_receipts(order_id,request_id,request_payload,received_by)
 VALUES(p_order,p_request,p_lines,auth.uid()) RETURNING id INTO v_receipt;
 FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
   v_line_id:=(v_row.value->>'line_id')::uuid;
   v_qty:=(v_row.value->>'quantity')::numeric;
   SELECT l.ingredient_id,l.unit_cost INTO v_line FROM public.purchase_order_lines l WHERE id=v_line_id;
   UPDATE public.purchase_order_lines SET received_qty=received_qty+v_qty WHERE id=v_line_id;
   UPDATE public.inventory_ingredients SET on_hand=on_hand+v_qty WHERE id=v_line.ingredient_id;
   INSERT INTO public.purchase_receipt_lines(receipt_id,order_line_id,quantity,unit_cost_snapshot)
   VALUES(v_receipt,v_line_id,v_qty,v_line.unit_cost);
   INSERT INTO public.inventory_movements(resource_type,resource_id,delta,reason,actor_id)
   VALUES('ingredient',v_line.ingredient_id::text,v_qty,'Purchase receipt '||left(p_order::text,8),auth.uid());
 END LOOP;
 UPDATE public.purchase_orders SET
   status=CASE WHEN EXISTS(SELECT 1 FROM public.purchase_order_lines
           WHERE order_id=p_order AND received_qty<quantity) THEN 'partially_received' ELSE 'received' END,
   updated_at=now() WHERE id=p_order;
 RETURN v_receipt;
END; $$;

REVOKE ALL ON FUNCTION public.purchase_create_order(uuid,text,jsonb),
 public.purchase_change_status(uuid,text),public.purchase_receive(uuid,uuid,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_create_order(uuid,text,jsonb),
 public.purchase_change_status(uuid,text),public.purchase_receive(uuid,uuid,jsonb) TO authenticated;
COMMIT;
