-- Chap Khana v3.18: ingredient lots (FEFO), audited waste, and physical stocktaking.
-- Requires migrations 14-16. Test on staging before running against production.
-- All new stock logic is transactional; existing ingredient balances are preserved.
BEGIN;
DO $prereq$ BEGIN
 IF to_regclass('public.inventory_ingredients') IS NULL OR
    to_regclass('public.inventory_movements') IS NULL OR
    to_regclass('public.purchase_returns') IS NULL OR
    to_regprocedure('public.inventory_adjust_stock(text,text,numeric,text)') IS NULL THEN
   RAISE EXCEPTION 'Run Chap Khana SQL migrations 14, 15 and 16 first';
 END IF;
END $prereq$;

CREATE TABLE IF NOT EXISTS public.inventory_expiry_lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ingredient_id uuid NOT NULL REFERENCES public.inventory_ingredients(id) ON DELETE RESTRICT,
 batch_code text NOT NULL DEFAULT '' CHECK(length(batch_code)<=80),
 expires_on date,
 received_qty numeric(14,3) NOT NULL CHECK(received_qty>0),
 remaining_qty numeric(14,3) NOT NULL CHECK(remaining_qty>=0 AND remaining_qty<=received_qty),
 source_movement_id bigint UNIQUE REFERENCES public.inventory_movements(id) ON DELETE RESTRICT,
 source_kind text NOT NULL DEFAULT 'movement' CHECK(source_kind IN ('movement','opening','split')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_lots_fefo_idx ON public.inventory_expiry_lots(ingredient_id,expires_on,id) WHERE remaining_qty>0;
CREATE TABLE IF NOT EXISTS public.inventory_lot_consumptions (
 movement_id bigint NOT NULL REFERENCES public.inventory_movements(id) ON DELETE RESTRICT,
 lot_id uuid NOT NULL REFERENCES public.inventory_expiry_lots(id) ON DELETE RESTRICT,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 refunded_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK(refunded_qty>=0 AND refunded_qty<=quantity),
 PRIMARY KEY(movement_id,lot_id)
);
-- The referenced movement row is written in the same transaction as the stock update.
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.inventory_expiry_lots(id);
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS request_id uuid UNIQUE;

CREATE TABLE IF NOT EXISTS public.inventory_stocktakes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=300),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 posted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 posted_at timestamptz,
 posted_payload jsonb
);
CREATE TABLE IF NOT EXISTS public.inventory_stocktake_lines (
 stocktake_id uuid NOT NULL REFERENCES public.inventory_stocktakes(id) ON DELETE RESTRICT,
 ingredient_id uuid NOT NULL REFERENCES public.inventory_ingredients(id) ON DELETE RESTRICT,
 expected_qty numeric(14,3) NOT NULL CHECK(expected_qty>=0),
 counted_qty numeric(14,3) CHECK(counted_qty>=0),
 PRIMARY KEY(stocktake_id,ingredient_id)
);
CREATE INDEX IF NOT EXISTS inventory_stocktake_recent_idx ON public.inventory_stocktakes(created_at DESC);

ALTER TABLE public.inventory_expiry_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lot_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stocktake_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_expiry_lots,public.inventory_lot_consumptions,
 public.inventory_stocktakes,public.inventory_stocktake_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.inventory_expiry_lots,public.inventory_stocktakes,public.inventory_stocktake_lines TO authenticated;
CREATE POLICY inventory_lots_staff_select ON public.inventory_expiry_lots FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY inventory_stocktakes_staff_select ON public.inventory_stocktakes FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY inventory_stocktake_lines_staff_select ON public.inventory_stocktake_lines FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
-- No direct client writes to any of these tables or movement lot/request columns.

-- All ingredient balance changes from checkout, receiving, cancellation, supplier returns
-- and manual adjustments already generate inventory_movements. Mirror them into FEFO lots.
-- In particular, order reservations cannot consume expired batches.
CREATE OR REPLACE FUNCTION private.inventory_apply_lot_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;v_remaining numeric(14,3);v_take numeric(14,3);v_lot record;
 v_today date := (pg_catalog.now() AT TIME ZONE 'Asia/Dhaka')::date;
BEGIN
 IF NEW.resource_type<>'ingredient' THEN RETURN NEW; END IF;
 v_id:=NEW.resource_id::uuid;
 IF NEW.delta>0 THEN
   v_remaining:=NEW.delta;
   -- Restore cancelled-order reservations to the ORIGINAL lots, preserving expiry.
   IF NEW.reason='Order cancellation refund' AND NEW.order_id IS NOT NULL THEN
     FOR v_lot IN SELECT c.movement_id,c.lot_id,(c.quantity-c.refunded_qty) AS refundable
      FROM public.inventory_lot_consumptions c
      JOIN public.inventory_movements m ON m.id=c.movement_id
      WHERE m.order_id=NEW.order_id AND m.resource_id=NEW.resource_id
       AND m.reason='Order reservation' AND c.quantity>c.refunded_qty
      ORDER BY c.movement_id,c.lot_id FOR UPDATE OF c LOOP
       EXIT WHEN v_remaining=0;
       v_take:=least(v_remaining,v_lot.refundable);
       UPDATE public.inventory_expiry_lots SET remaining_qty=remaining_qty+v_take WHERE id=v_lot.lot_id;
       UPDATE public.inventory_lot_consumptions SET refunded_qty=refunded_qty+v_take
        WHERE movement_id=v_lot.movement_id AND lot_id=v_lot.lot_id;
       v_remaining:=v_remaining-v_take;
     END LOOP;
   END IF;
   -- Refunds for orders placed before migration 17 have no allocations: untagged lot.
   IF v_remaining>0 THEN
     INSERT INTO public.inventory_expiry_lots(ingredient_id,received_qty,remaining_qty,source_movement_id)
       VALUES(v_id,v_remaining,v_remaining,NEW.id);
   END IF;
 ELSE
   v_remaining:=-NEW.delta;
   FOR v_lot IN SELECT id,remaining_qty FROM public.inventory_expiry_lots
       WHERE ingredient_id=v_id AND remaining_qty>0
         AND (NEW.lot_id IS NULL OR id=NEW.lot_id)
         AND (NEW.reason<>'Order reservation' OR expires_on IS NULL OR expires_on>=v_today)
       ORDER BY expires_on ASC NULLS LAST,created_at,id FOR UPDATE LOOP
     EXIT WHEN v_remaining=0;
     v_take:=least(v_remaining,v_lot.remaining_qty);
     UPDATE public.inventory_expiry_lots SET remaining_qty=remaining_qty-v_take WHERE id=v_lot.id;
     INSERT INTO public.inventory_lot_consumptions(movement_id,lot_id,quantity)
       VALUES(NEW.id,v_lot.id,v_take);
     v_remaining:=v_remaining-v_take;
   END LOOP;
   IF v_remaining>0 THEN
     RAISE EXCEPTION 'Insufficient % stock in % batches for this movement. Check expiry and stocktake.',
       NEW.reason,NEW.resource_id;
   END IF;
 END IF;
 RETURN NEW;
END; $$;

-- Existing physical stock is admitted as an untagged opening lot; no stock is added.
-- Lock ingredient rows against concurrent order placement/receiving during migration.
DO $seed$ DECLARE v_item record; BEGIN
 FOR v_item IN SELECT id,on_hand FROM public.inventory_ingredients ORDER BY id FOR UPDATE LOOP
   IF v_item.on_hand>0 AND NOT EXISTS(
      SELECT 1 FROM public.inventory_expiry_lots WHERE ingredient_id=v_item.id) THEN
      INSERT INTO public.inventory_expiry_lots(ingredient_id,received_qty,remaining_qty,source_kind)
        VALUES(v_item.id,v_item.on_hand,v_item.on_hand,'opening');
   END IF;
 END LOOP;
END $seed$;
DROP TRIGGER IF EXISTS inventory_movement_apply_lots ON public.inventory_movements;
CREATE TRIGGER inventory_movement_apply_lots AFTER INSERT ON public.inventory_movements
 FOR EACH ROW EXECUTE FUNCTION private.inventory_apply_lot_movement();

-- Add batch number/expiry to stock received via purchase_receive or adjustments.
-- Tagging does NOT add stock and cannot move quantities between ingredients.
CREATE OR REPLACE FUNCTION public.inventory_tag_lot(p_lot uuid,p_batch text,p_expiry date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF p_lot IS NULL OR length(coalesce(p_batch,''))>80 OR
    (p_expiry IS NOT NULL AND p_expiry NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31') THEN
   RAISE EXCEPTION 'Invalid batch details'; END IF;
 UPDATE public.inventory_expiry_lots SET batch_code=trim(coalesce(p_batch,'')),expires_on=p_expiry
  WHERE id=p_lot;
 IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
END; $$;

-- Split an untagged or mixed-ingredient lot into a separately expiring batch, without
-- changing physical stock. The parent remains valid with its reduced opening volume.
CREATE OR REPLACE FUNCTION public.inventory_split_lot(p_lot uuid,p_qty numeric,p_batch text,p_expiry date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row record;v_id uuid;
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF p_lot IS NULL OR p_qty IS NULL OR p_qty<=0 OR p_qty<>round(p_qty,3) OR
    p_qty>1000000 OR length(coalesce(p_batch,''))>80 OR
    (p_expiry IS NOT NULL AND p_expiry NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31') THEN
   RAISE EXCEPTION 'Invalid split'; END IF;
 SELECT l.*,i.unit INTO v_row FROM public.inventory_expiry_lots l
  JOIN public.inventory_ingredients i ON i.id=l.ingredient_id WHERE l.id=p_lot FOR UPDATE OF l;
 IF NOT FOUND OR v_row.remaining_qty<=p_qty THEN
   RAISE EXCEPTION 'Split must leave positive remaining stock in the source batch'; END IF;
 IF v_row.unit='piece' AND p_qty<>trunc(p_qty) THEN RAISE EXCEPTION 'Pieces must be whole'; END IF;
 UPDATE public.inventory_expiry_lots SET remaining_qty=remaining_qty-p_qty,
   received_qty=received_qty-p_qty WHERE id=p_lot;
 INSERT INTO public.inventory_expiry_lots(ingredient_id,batch_code,expires_on,received_qty,remaining_qty,source_kind)
  VALUES(v_row.ingredient_id,trim(coalesce(p_batch,'')),p_expiry,p_qty,p_qty,'split') RETURNING id INTO v_id;
 RETURN v_id;
END; $$;

-- Waste and expiry disposal: one audited stock movement and an idempotency key.
-- Passing p_lot selects a specific ingredient batch; menu servings have no lots.
CREATE OR REPLACE FUNCTION public.inventory_record_waste(
 p_kind text,p_id text,p_qty numeric,p_reason text,p_lot uuid,p_request uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_existing record;v_qty integer;v_id bigint;v_name text;
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF p_request IS NULL OR p_kind NOT IN ('ingredient','menu') OR p_id IS NULL OR
    p_qty IS NULL OR p_qty<=0 OR p_qty>1000000 OR p_qty<>round(p_qty,3) OR
    length(trim(coalesce(p_reason,''))) NOT BETWEEN 2 AND 190 OR
    (p_kind='menu' AND (p_lot IS NOT NULL OR p_qty<>trunc(p_qty))) THEN
    RAISE EXCEPTION 'Invalid waste request'; END IF;
 v_name:='Waste: '||trim(p_reason);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text, 0));
 SELECT * INTO v_existing FROM public.inventory_movements WHERE request_id=p_request;
 IF FOUND THEN
   IF v_existing.resource_type=p_kind AND v_existing.resource_id=p_id AND
      v_existing.delta=-p_qty AND v_existing.reason=v_name AND
      v_existing.lot_id IS NOT DISTINCT FROM p_lot THEN RETURN v_existing.id; END IF;
   RAISE EXCEPTION 'Request ID already used for a different waste movement';
 END IF;
 IF p_kind='ingredient' THEN
   IF p_id !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'Invalid ingredient ID'; END IF;
   IF p_lot IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.inventory_expiry_lots
      WHERE id=p_lot AND ingredient_id=p_id::uuid AND remaining_qty>=p_qty) THEN
      RAISE EXCEPTION 'Selected batch has insufficient stock'; END IF;
   UPDATE public.inventory_ingredients SET on_hand=on_hand-p_qty
     WHERE id=p_id::uuid AND on_hand>=p_qty AND (unit<>'piece' OR p_qty=trunc(p_qty));
 ELSE
   UPDATE public.inventory_menu_stock SET on_hand=on_hand-p_qty::integer
     WHERE menu_item_id=p_id AND on_hand>=p_qty;
 END IF;
 GET DIAGNOSTICS v_qty=ROW_COUNT;
 IF v_qty<>1 THEN RAISE EXCEPTION 'Insufficient stock for waste'; END IF;
 INSERT INTO public.inventory_movements(resource_type,resource_id,delta,reason,actor_id,lot_id,request_id)
 VALUES(p_kind,p_id,-p_qty,v_name,auth.uid(),p_lot,p_request) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.inventory_start_stocktake(p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;v_total integer;
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF length(coalesce(p_notes,''))>300 THEN RAISE EXCEPTION 'Notes too long'; END IF;
 SELECT count(*) INTO v_total FROM public.inventory_ingredients WHERE active AND tracked;
 IF v_total NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Stocktaking requires 1-200 active, tracked ingredients'; END IF;
 INSERT INTO public.inventory_stocktakes(notes,created_by)
 VALUES(trim(coalesce(p_notes,'')),auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.inventory_stocktake_lines(stocktake_id,ingredient_id,expected_qty)
 SELECT v_id,id,on_hand FROM public.inventory_ingredients WHERE active AND tracked;
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.inventory_post_stocktake(p_stocktake uuid,p_counts jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_record record;v_take record;v_qty numeric;v_unit text;v_count integer;
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF p_stocktake IS NULL OR p_counts IS NULL OR pg_catalog.jsonb_typeof(p_counts)<>'array' OR
    pg_catalog.jsonb_array_length(p_counts)>200 THEN RAISE EXCEPTION 'Invalid stocktake count'; END IF;
 SELECT * INTO v_take FROM public.inventory_stocktakes WHERE id=p_stocktake FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stocktake not found'; END IF;
 IF v_take.status='posted' THEN
   IF v_take.posted_payload=p_counts THEN RETURN p_stocktake; END IF;
   RAISE EXCEPTION 'Stocktake already posted with different quantities';
 END IF;
 SELECT count(*) INTO v_count FROM public.inventory_stocktake_lines WHERE stocktake_id=p_stocktake;
 IF v_count=0 OR v_count<>pg_catalog.jsonb_array_length(p_counts) OR
    v_count<>(SELECT count(DISTINCT value->>'ingredient_id') FROM pg_catalog.jsonb_array_elements(p_counts)) THEN
     RAISE EXCEPTION 'Count every stocktake ingredient exactly once'; END IF;
 -- Check syntax and names BEFORE writing any new stock balance.
 FOR v_record IN SELECT value FROM pg_catalog.jsonb_array_elements(p_counts) LOOP
   IF pg_catalog.jsonb_typeof(v_record.value)<>'object' OR
      coalesce(v_record.value->>'ingredient_id','') !~ '^[0-9a-fA-F-]{36}$' OR
      coalesce(v_record.value->>'counted','') !~ '^[0-9]+(\.[0-9]{1,3})?$' THEN
     RAISE EXCEPTION 'Invalid counted quantity'; END IF;
   v_qty:=(v_record.value->>'counted')::numeric;
   IF v_qty>1000000 OR NOT EXISTS(SELECT 1 FROM public.inventory_stocktake_lines
      WHERE stocktake_id=p_stocktake AND ingredient_id=(v_record.value->>'ingredient_id')::uuid) THEN
      RAISE EXCEPTION 'Unexpected ingredient or invalid count'; END IF;
 END LOOP;
 FOR v_record IN SELECT l.ingredient_id,l.expected_qty,i.on_hand,i.unit
    FROM public.inventory_stocktake_lines l JOIN public.inventory_ingredients i ON i.id=l.ingredient_id
    WHERE l.stocktake_id=p_stocktake ORDER BY l.ingredient_id FOR UPDATE OF i,l LOOP
   v_qty:=(SELECT (value->>'counted')::numeric FROM pg_catalog.jsonb_array_elements(p_counts)
     WHERE value->>'ingredient_id'=v_record.ingredient_id::text);
   IF v_record.on_hand<>v_record.expected_qty THEN
     RAISE EXCEPTION 'Stock changed since counting started. Start a fresh stocktake.';
   END IF;
   IF v_record.unit='piece' AND v_qty<>trunc(v_qty) THEN RAISE EXCEPTION 'Piece counts must be whole numbers'; END IF;
   IF v_qty<>v_record.expected_qty THEN
     PERFORM public.inventory_adjust_stock('ingredient',v_record.ingredient_id::text,
       v_qty-v_record.expected_qty,'Stocktake reconciliation '||p_stocktake::text);
   END IF;
   UPDATE public.inventory_stocktake_lines SET counted_qty=v_qty
     WHERE stocktake_id=p_stocktake AND ingredient_id=v_record.ingredient_id;
 END LOOP;
 UPDATE public.inventory_stocktakes SET status='posted',posted_at=now(),posted_by=auth.uid(),
  posted_payload=p_counts WHERE id=p_stocktake;
 RETURN p_stocktake;
END; $$;

-- Availability now accounts for unexpired batch quantities (including unknown-expiry lots).
-- No customer can query raw quantities/expiry dates.
CREATE OR REPLACE FUNCTION public.menu_inventory_availability()
RETURNS TABLE(menu_item_id text,in_stock boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m.id,
  (NOT coalesce((SELECT enabled FROM public.inventory_settings WHERE id=1),false)
   OR (
    NOT EXISTS (SELECT 1 FROM public.inventory_menu_stock ms
     WHERE ms.menu_item_id=m.id AND ms.tracked AND ms.on_hand<1)
    AND NOT EXISTS (
      SELECT 1 FROM public.inventory_recipes r
      JOIN public.inventory_ingredients i ON i.id=r.ingredient_id
      WHERE r.menu_item_id=m.id AND i.tracked AND (NOT i.active OR
       coalesce((SELECT sum(l.remaining_qty) FROM public.inventory_expiry_lots l
         WHERE l.ingredient_id=i.id AND (l.expires_on IS NULL OR
           l.expires_on>=(pg_catalog.now() AT TIME ZONE 'Asia/Dhaka')::date)),0)<r.quantity_per_item)
    )
   ))
 FROM public.menu_items m WHERE m.active;
$$;

REVOKE ALL ON FUNCTION public.inventory_tag_lot(uuid,text,date),
 public.inventory_split_lot(uuid,numeric,text,date),
 public.inventory_record_waste(text,text,numeric,text,uuid,uuid),
 public.inventory_start_stocktake(text),public.inventory_post_stocktake(uuid,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_tag_lot(uuid,text,date),
 public.inventory_split_lot(uuid,numeric,text,date),
 public.inventory_record_waste(text,text,numeric,text,uuid,uuid),
 public.inventory_start_stocktake(text),public.inventory_post_stocktake(uuid,jsonb)
 TO authenticated;
REVOKE ALL ON FUNCTION private.inventory_apply_lot_movement() FROM PUBLIC,anon,authenticated;
DO $check$ BEGIN
 IF has_table_privilege('anon','public.inventory_expiry_lots','SELECT') OR
    has_table_privilege('authenticated','public.inventory_expiry_lots','UPDATE') OR
    has_table_privilege('authenticated','public.inventory_stocktake_lines','INSERT') THEN
    RAISE EXCEPTION 'Unsafe lot/stocktake grants'; END IF;
 IF EXISTS (SELECT 1 FROM public.inventory_ingredients i
    WHERE abs(i.on_hand-coalesce((SELECT sum(l.remaining_qty) FROM public.inventory_expiry_lots l
      WHERE l.ingredient_id=i.id),0))>0.0001) THEN
     RAISE EXCEPTION 'Lot quantities must match current physical ingredient stock';
 END IF;
END $check$;
COMMIT;
