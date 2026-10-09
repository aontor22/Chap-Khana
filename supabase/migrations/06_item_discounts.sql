-- v3.3 | per-item discounts, non-destructive.
-- Run ONCE after 01_fresh_schema.sql + 03_production_hardening.sql +
-- 04_brand_menu_catalog.sql (05_reference_food_images.sql is unrelated).
-- Works on existing databases. No historical order values are rewritten.
-- Manual QA after migration: set an item discount in admin, place a TEST order
-- with ordering enabled, and compare public.orders / public.order_items totals.
BEGIN;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_value integer NOT NULL DEFAULT 0;

-- All discounted prices remain positive; invalid admin input is rejected in DB.
DO $constraint$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='menu_items_discount_valid' AND conrelid='public.menu_items'::regclass) THEN
    ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_discount_valid CHECK (
      (discount_type='none' AND discount_value=0) OR
      (discount_type='percent' AND price IS NOT NULL AND discount_value BETWEEN 1 AND 99) OR
      (discount_type='fixed' AND price IS NOT NULL AND discount_value>=1 AND discount_value<price)
    );
  END IF;
END;
$constraint$;

-- Snapshot original price and discount applied to each NEW order line.
-- Historical orders keep their existing unit_price and line_total, and get NULL
-- original_unit_price / zero discount because they predate this feature.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS original_unit_price integer,
  ADD COLUMN IF NOT EXISTS discount_unit_amount integer NOT NULL DEFAULT 0;
DO $constraint$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='order_item_discount_snapshot_valid' AND conrelid='public.order_items'::regclass) THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_item_discount_snapshot_valid CHECK (
      (original_unit_price IS NULL AND discount_unit_amount=0) OR
      (original_unit_price IS NOT NULL AND original_unit_price>=unit_price AND discount_unit_amount=original_unit_price-unit_price)
    );
  END IF;
END;
$constraint$;

-- Maintain existing API names/signatures. v2 places orders through this impl,
-- keeping its request-id deduplication and rate-limiting intact.
-- Checkout never trusts any price/discount sent by the browser.
create or replace function private.place_order_impl(
  p_name text, p_phone text, p_type text, p_address text, p_notes text, p_items jsonb
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_cfg public.store_settings%rowtype;
  v_line record;
  v_menu public.menu_items%rowtype;
  v_subtotal integer := 0;
  v_fee integer := 0;
  v_unit_price integer := 0;
  v_order_id uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_code text := 'CK-' || upper(substring(replace(v_order_id::text,'-','') from 1 for 10));
  v_count integer;
begin
  select * into v_cfg from public.store_settings where id = 1;
  if not found or not v_cfg.accepting_orders then
    raise exception 'Online ordering is currently closed.';
  end if;
  if p_type not in ('pickup','delivery') or
     (p_type='pickup' and not v_cfg.pickup_enabled) or
     (p_type='delivery' and not v_cfg.delivery_enabled) then
    raise exception 'This fulfillment method is unavailable.';
  end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 80 then
    raise exception 'Please enter a valid name.';
  end if;
  if coalesce(p_phone,'') !~ '^(\+?88)?01[3-9][0-9]{8}$' then
    raise exception 'Please enter a valid Bangladesh mobile number.';
  end if;
  if p_type='delivery' and length(trim(coalesce(p_address,''))) not between 8 and 350 then
    raise exception 'A delivery address of at least 8 characters is required.';
  end if;
  if length(coalesce(p_notes,'')) > 500 then
    raise exception 'Order notes are too long.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 25 then
    raise exception 'An order must have between 1 and 25 line items.';
  end if;
  -- Validate every line BEFORE inserting any order record.
  for v_line in select * from jsonb_array_elements(p_items) as entry(value) loop
    if jsonb_typeof(v_line.value) <> 'object' or
       jsonb_typeof(v_line.value->'id') <> 'string' or
       coalesce(v_line.value->>'qty','') !~ '^([1-9]|1[0-9]|20)$' then
      raise exception 'An order item is invalid.';
    end if;
  end loop;
  select count(distinct entry.value->>'id') into v_count
  from jsonb_array_elements(p_items) as entry(value);
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'Duplicate items are not allowed.';
  end if;
  for v_line in select (value->>'id') as item_id, (value->>'qty')::integer as qty
                from jsonb_array_elements(p_items) loop
    select * into v_menu from public.menu_items
    where id=v_line.item_id and active and available and price is not null and price>0
    for share;
    if not found then
      raise exception 'An item is unavailable. Please refresh the menu.';
    end if;
    v_unit_price := case
      when v_menu.discount_type='percent' then greatest(1, round(v_menu.price::numeric * (100 - v_menu.discount_value) / 100)::integer)
      when v_menu.discount_type='fixed' then v_menu.price - v_menu.discount_value
      else v_menu.price end;
    v_subtotal := v_subtotal + v_unit_price * v_line.qty;
  end loop;
  v_fee := case when p_type='delivery' then v_cfg.delivery_fee else 0 end;
  insert into public.orders(
    id, code, tracking_token, customer_user_id, customer_name, customer_phone, fulfillment_type,
    delivery_address, notes, subtotal, delivery_fee, total
  ) values (
    v_order_id, v_code, v_token, auth.uid(), trim(p_name), p_phone, p_type,
    case when p_type='delivery' then trim(p_address) else '' end,
    coalesce(trim(p_notes),''), v_subtotal, v_fee, v_subtotal+v_fee
  );
  for v_line in select (value->>'id') as item_id, (value->>'qty')::integer as qty
                from jsonb_array_elements(p_items) loop
    select * into v_menu from public.menu_items where id=v_line.item_id;
    -- Rows were locked FOR SHARE during subtotal validation above: snapshot price
    -- and discount cannot be edited by staff until this transaction commits.
    v_unit_price := case
      when v_menu.discount_type='percent' then greatest(1, round(v_menu.price::numeric * (100 - v_menu.discount_value) / 100)::integer)
      when v_menu.discount_type='fixed' then v_menu.price - v_menu.discount_value
      else v_menu.price end;
    insert into public.order_items(order_id,menu_item_id,item_name,unit_price,original_unit_price,discount_unit_amount,qty,line_total)
    values(v_order_id,v_menu.id,v_menu.name,v_unit_price,v_menu.price,v_menu.price-v_unit_price,v_line.qty,v_unit_price*v_line.qty);
  end loop;
  return jsonb_build_object('code',v_code,'tracking_token',v_token,'total',v_subtotal+v_fee);
end;
$$;


COMMIT;
