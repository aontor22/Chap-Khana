-- Chap Khana v3.15.0: menu serving limits + ingredient recipe stock.
-- Requires migrations 01-13. Transactional, non-destructive and OFF by default.
-- IMPORTANT: Run on staging, verify order/cancellation flows, then enable inventory.
BEGIN;
DO $prereq$ BEGIN
 IF to_regclass('public.loyalty_accounts') IS NULL OR
    to_regclass('public.order_items') IS NULL OR
    to_regprocedure('public.place_order_v4(text,text,text,text,text,jsonb,uuid,text,integer)') IS NULL THEN
   RAISE EXCEPTION 'Inventory migration 14 requires Chap Khana migrations 01-13';
 END IF;
END $prereq$;

CREATE TABLE IF NOT EXISTS public.inventory_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK(id=1),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.inventory_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

-- Stock units are native to each ingredient. Recipes MUST use the same unit.
CREATE TABLE IF NOT EXISTS public.inventory_ingredients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL UNIQUE CHECK(length(trim(name)) BETWEEN 2 AND 100),
 unit text NOT NULL CHECK(unit IN ('g','kg','ml','l','piece')),
 on_hand numeric(14,3) NOT NULL DEFAULT 0 CHECK(on_hand>=0),
 reorder_level numeric(14,3) NOT NULL DEFAULT 0 CHECK(reorder_level>=0),
 tracked boolean NOT NULL DEFAULT true,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT inventory_piece_whole_units CHECK(unit<>'piece' OR
  (on_hand=trunc(on_hand) AND reorder_level=trunc(reorder_level)))
);
CREATE TABLE IF NOT EXISTS public.inventory_menu_stock (
 menu_item_id text PRIMARY KEY REFERENCES public.menu_items(id) ON DELETE CASCADE,
 on_hand integer NOT NULL DEFAULT 0 CHECK(on_hand>=0),
 reorder_level integer NOT NULL DEFAULT 0 CHECK(reorder_level>=0),
 tracked boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.inventory_recipes (
 menu_item_id text NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
 ingredient_id uuid NOT NULL REFERENCES public.inventory_ingredients(id) ON DELETE RESTRICT,
 quantity_per_item numeric(14,3) NOT NULL CHECK(quantity_per_item>0 AND quantity_per_item<=1000000),
 PRIMARY KEY(menu_item_id,ingredient_id)
);
CREATE INDEX IF NOT EXISTS inventory_recipes_ingredient_idx ON public.inventory_recipes(ingredient_id);

-- Immutable-by-client snapshots: used to refund *exact* consumed amounts on cancellation,
-- even after recipe/stock-tracking settings change.
CREATE TABLE IF NOT EXISTS public.inventory_reservation_lines (
 order_item_id bigint NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
 resource_type text NOT NULL CHECK(resource_type IN ('menu','ingredient')),
 resource_id text NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 released boolean NOT NULL DEFAULT false,
 PRIMARY KEY(order_item_id,resource_type,resource_id)
);
CREATE TABLE IF NOT EXISTS public.inventory_movements (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 resource_type text NOT NULL CHECK(resource_type IN ('menu','ingredient')),
 resource_id text NOT NULL,
 delta numeric(14,3) NOT NULL CHECK(delta<>0),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 2 AND 200),
 order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_movements_history_idx ON public.inventory_movements(created_at DESC,id DESC);

ALTER TABLE public.inventory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_menu_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_settings,public.inventory_ingredients,public.inventory_menu_stock,
 public.inventory_recipes,public.inventory_reservation_lines,public.inventory_movements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.inventory_settings,public.inventory_ingredients,public.inventory_menu_stock,
 public.inventory_recipes,public.inventory_movements TO authenticated;
GRANT UPDATE(enabled) ON public.inventory_settings TO authenticated;
GRANT INSERT(name,unit,reorder_level,tracked,active) ON public.inventory_ingredients TO authenticated;
GRANT UPDATE(name,reorder_level,tracked,active) ON public.inventory_ingredients TO authenticated;
-- No client DML on on_hand, reservations, movements or recipe rows.

DROP POLICY IF EXISTS inventory_settings_staff_select ON public.inventory_settings;
CREATE POLICY inventory_settings_staff_select ON public.inventory_settings FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
DROP POLICY IF EXISTS inventory_settings_staff_update ON public.inventory_settings;
CREATE POLICY inventory_settings_staff_update ON public.inventory_settings FOR UPDATE TO authenticated
 USING ((SELECT private.is_staff())) WITH CHECK ((SELECT private.is_staff()));
DROP POLICY IF EXISTS inventory_ingredients_staff_select ON public.inventory_ingredients;
CREATE POLICY inventory_ingredients_staff_select ON public.inventory_ingredients FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
DROP POLICY IF EXISTS inventory_ingredients_staff_insert ON public.inventory_ingredients;
CREATE POLICY inventory_ingredients_staff_insert ON public.inventory_ingredients FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_staff()));
DROP POLICY IF EXISTS inventory_ingredients_staff_update ON public.inventory_ingredients;
CREATE POLICY inventory_ingredients_staff_update ON public.inventory_ingredients FOR UPDATE TO authenticated
 USING ((SELECT private.is_staff())) WITH CHECK ((SELECT private.is_staff()));
DROP POLICY IF EXISTS inventory_menu_staff_read ON public.inventory_menu_stock;
CREATE POLICY inventory_menu_staff_read ON public.inventory_menu_stock FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
DROP POLICY IF EXISTS inventory_recipes_staff_read ON public.inventory_recipes;
CREATE POLICY inventory_recipes_staff_read ON public.inventory_recipes FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
DROP POLICY IF EXISTS inventory_movements_staff_read ON public.inventory_movements;
CREATE POLICY inventory_movements_staff_read ON public.inventory_movements FOR SELECT TO authenticated USING ((SELECT private.is_staff()));

-- Staff-only helper functions. SECURITY DEFINER runs with the migration owner's rights;
-- fixed search_path and explicit is_staff guard protect direct RPC access.
CREATE OR REPLACE FUNCTION public.inventory_configure_menu(p_item text,p_tracked boolean,p_reorder integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF p_item IS NULL OR p_tracked IS NULL OR p_reorder IS NULL OR p_reorder NOT BETWEEN 0 AND 1000000 THEN
   RAISE EXCEPTION 'Invalid menu stock settings'; END IF;
 PERFORM 1 FROM public.menu_items WHERE id=p_item FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Menu item not found'; END IF;
 INSERT INTO public.inventory_menu_stock(menu_item_id,tracked,reorder_level)
 VALUES (p_item,p_tracked,p_reorder)
 ON CONFLICT(menu_item_id) DO UPDATE SET tracked=EXCLUDED.tracked,reorder_level=EXCLUDED.reorder_level;
END; $$;

CREATE OR REPLACE FUNCTION public.inventory_set_recipe(p_item text,p_lines jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row record;
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array' OR pg_catalog.jsonb_array_length(p_lines)>50 THEN
   RAISE EXCEPTION 'Recipe must be an array of at most 50 ingredients'; END IF;
 PERFORM 1 FROM public.menu_items WHERE id=p_item FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Menu item not found'; END IF;
 IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(p_lines)) <>
    (SELECT count(DISTINCT value->>'ingredient_id') FROM pg_catalog.jsonb_array_elements(p_lines)) THEN
   RAISE EXCEPTION 'Duplicate recipe ingredient'; END IF;
 -- Validate all rows BEFORE deleting the old recipe.
 FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
   IF pg_catalog.jsonb_typeof(v_row.value)<>'object' OR
      coalesce(v_row.value->>'ingredient_id','') !~ '^[0-9a-fA-F-]{36}$' OR
      coalesce(v_row.value->>'quantity_per_item','') !~ '^[0-9]+(\.[0-9]{1,3})?$' THEN
      RAISE EXCEPTION 'Invalid recipe ingredient row'; END IF;
   IF (v_row.value->>'quantity_per_item')::numeric NOT BETWEEN 0.001 AND 1000000 THEN
      RAISE EXCEPTION 'Recipe quantity is out of range'; END IF;
   PERFORM 1 FROM public.inventory_ingredients WHERE id=(v_row.value->>'ingredient_id')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'Ingredient does not exist'; END IF;
   IF EXISTS (SELECT 1 FROM public.inventory_ingredients
     WHERE id=(v_row.value->>'ingredient_id')::uuid AND unit='piece') AND
     (v_row.value->>'quantity_per_item')::numeric<>trunc((v_row.value->>'quantity_per_item')::numeric) THEN
     RAISE EXCEPTION 'Piece ingredients require whole number quantities'; END IF;
 END LOOP;
 DELETE FROM public.inventory_recipes WHERE menu_item_id=p_item;
 INSERT INTO public.inventory_recipes(menu_item_id,ingredient_id,quantity_per_item)
 SELECT p_item,(value->>'ingredient_id')::uuid,(value->>'quantity_per_item')::numeric
 FROM pg_catalog.jsonb_array_elements(p_lines);
END; $$;

-- Positive restock and negative waste/correction. Existing stock cannot go below zero.
CREATE OR REPLACE FUNCTION public.inventory_adjust_stock(p_kind text,p_id text,p_delta numeric,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ordered integer;
BEGIN
 IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF p_kind NOT IN ('menu','ingredient') OR p_delta IS NULL OR p_delta=0 OR abs(p_delta)>1000000 OR
    p_delta<>round(p_delta,3) OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 2 AND 200 THEN
   RAISE EXCEPTION 'Invalid inventory adjustment'; END IF;
 IF p_kind='menu' THEN
   IF p_delta<>trunc(p_delta) THEN RAISE EXCEPTION 'Menu servings must be whole numbers'; END IF;
   UPDATE public.inventory_menu_stock SET on_hand=on_hand+p_delta::integer
     WHERE menu_item_id=p_id AND on_hand+p_delta>=0;
 ELSE
   IF coalesce(p_id,'') !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'Invalid ingredient ID'; END IF;
   UPDATE public.inventory_ingredients SET on_hand=on_hand+p_delta
     WHERE id=p_id::uuid AND on_hand+p_delta>=0;
 END IF;
 GET DIAGNOSTICS v_ordered=ROW_COUNT;
 IF v_ordered<>1 THEN RAISE EXCEPTION 'Stock row not found or insufficient stock'; END IF;
 INSERT INTO public.inventory_movements(resource_type,resource_id,delta,reason,actor_id)
 VALUES(p_kind,p_id,p_delta,trim(p_reason),auth.uid());
END; $$;

-- Checkout uses the SAME trigger for v2/v3/v4. If any tracked stock is insufficient,
-- the entire checkout transaction rolls back (including coupons and loyalty points).
CREATE OR REPLACE FUNCTION private.reserve_order_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_enabled boolean;v_tracked boolean;v_remaining integer;v_recipe record;
 v_need numeric(14,3);v_order_id uuid;
BEGIN
 IF NEW.menu_item_id IS NULL THEN RETURN NEW; END IF;
 SELECT enabled INTO v_enabled FROM public.inventory_settings WHERE id=1;
 IF NOT coalesce(v_enabled,false) THEN RETURN NEW; END IF;
 -- Checkout functions already acquire FOR SHARE on menu_items; recipe editor acquires
 -- FOR UPDATE, so order placement cannot race with a recipe replacement.
 PERFORM 1 FROM public.menu_items WHERE id=NEW.menu_item_id FOR SHARE;
 SELECT tracked INTO v_tracked FROM public.inventory_menu_stock WHERE menu_item_id=NEW.menu_item_id;
 SELECT NEW.order_id INTO v_order_id;
 IF coalesce(v_tracked,false) THEN
   UPDATE public.inventory_menu_stock SET on_hand=on_hand-NEW.qty
    WHERE menu_item_id=NEW.menu_item_id AND tracked AND on_hand>=NEW.qty
    RETURNING on_hand INTO v_remaining;
   IF NOT FOUND THEN RAISE EXCEPTION 'Not enough menu-item stock for %. Please refresh your cart.',NEW.item_name; END IF;
   INSERT INTO public.inventory_reservation_lines(order_item_id,resource_type,resource_id,quantity)
    VALUES(NEW.id,'menu',NEW.menu_item_id,NEW.qty);
   INSERT INTO public.inventory_movements(resource_type,resource_id,delta,reason,order_id)
    VALUES('menu',NEW.menu_item_id,-NEW.qty,'Order reservation',v_order_id);
 END IF;
 FOR v_recipe IN SELECT r.ingredient_id,r.quantity_per_item,i.name,i.tracked,i.active
    FROM public.inventory_recipes r JOIN public.inventory_ingredients i ON i.id=r.ingredient_id
    WHERE r.menu_item_id=NEW.menu_item_id ORDER BY r.ingredient_id LOOP
   IF v_recipe.tracked THEN
     IF NOT v_recipe.active THEN RAISE EXCEPTION 'A dish ingredient is unavailable. Please refresh the menu.'; END IF;
     v_need:=v_recipe.quantity_per_item*NEW.qty;
     UPDATE public.inventory_ingredients SET on_hand=on_hand-v_need
      WHERE id=v_recipe.ingredient_id AND tracked AND active AND on_hand>=v_need;
     IF NOT FOUND THEN RAISE EXCEPTION 'A dish is out of stock. Please refresh the menu.'; END IF;
     INSERT INTO public.inventory_reservation_lines(order_item_id,resource_type,resource_id,quantity)
       VALUES(NEW.id,'ingredient',v_recipe.ingredient_id::text,v_need);
     INSERT INTO public.inventory_movements(resource_type,resource_id,delta,reason,order_id)
       VALUES('ingredient',v_recipe.ingredient_id::text,-v_need,'Order reservation',v_order_id);
   END IF;
 END LOOP;
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION private.restore_cancelled_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_line record;
BEGIN
 IF NEW.status<>'cancelled' OR NEW.status=OLD.status THEN RETURN NEW; END IF;
 FOR v_line IN SELECT r.order_item_id,r.resource_type,r.resource_id,r.quantity
   FROM public.inventory_reservation_lines r JOIN public.order_items oi ON oi.id=r.order_item_id
   WHERE oi.order_id=NEW.id AND NOT r.released
   ORDER BY r.order_item_id,r.resource_type,r.resource_id FOR UPDATE OF r LOOP
   IF v_line.resource_type='menu' THEN
     UPDATE public.inventory_menu_stock SET on_hand=on_hand+v_line.quantity::integer
       WHERE menu_item_id=v_line.resource_id;
   ELSE
     UPDATE public.inventory_ingredients SET on_hand=on_hand+v_line.quantity
       WHERE id=v_line.resource_id::uuid;
   END IF;
   -- No reservations are deleted; released flag makes cancellation idempotent.
   UPDATE public.inventory_reservation_lines SET released=true
     WHERE order_item_id=v_line.order_item_id AND resource_type=v_line.resource_type AND resource_id=v_line.resource_id;
   INSERT INTO public.inventory_movements(resource_type,resource_id,delta,reason,order_id)
     VALUES(v_line.resource_type,v_line.resource_id,v_line.quantity,'Order cancellation refund',NEW.id);
 END LOOP;
 RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS inventory_order_item_reserve ON public.order_items;
CREATE TRIGGER inventory_order_item_reserve AFTER INSERT ON public.order_items
 FOR EACH ROW EXECUTE FUNCTION private.reserve_order_inventory();
DROP TRIGGER IF EXISTS inventory_order_cancel_restore ON public.orders;
CREATE TRIGGER inventory_order_cancel_restore AFTER UPDATE OF status ON public.orders
 FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status='cancelled')
 EXECUTE FUNCTION private.restore_cancelled_inventory();

-- Safe, read-only public availability boolean; no ingredient names or counts exposed.
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
      WHERE r.menu_item_id=m.id AND i.tracked AND (NOT i.active OR i.on_hand<r.quantity_per_item)
    )
   ))
 FROM public.menu_items m WHERE m.active;
$$;

REVOKE ALL ON FUNCTION public.inventory_configure_menu(text,boolean,integer),
 public.inventory_set_recipe(text,jsonb),public.inventory_adjust_stock(text,text,numeric,text),
 public.menu_inventory_availability() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_configure_menu(text,boolean,integer),
 public.inventory_set_recipe(text,jsonb),public.inventory_adjust_stock(text,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.menu_inventory_availability() TO anon,authenticated;
REVOKE ALL ON FUNCTION private.reserve_order_inventory(),private.restore_cancelled_inventory() FROM PUBLIC,anon,authenticated;

-- Confirm inventory starts OFF on first install, so historical orders are unaffected.
DO $checks$ BEGIN
 IF (SELECT enabled FROM public.inventory_settings WHERE id=1) IS NULL THEN
   RAISE EXCEPTION 'Inventory settings row missing';
 END IF;
 IF has_table_privilege('anon','public.inventory_ingredients','SELECT') OR
    has_table_privilege('authenticated','public.inventory_ingredients','UPDATE') THEN
   RAISE EXCEPTION 'Unsafe inventory table grants';
 END IF;
END $checks$;
COMMIT;
