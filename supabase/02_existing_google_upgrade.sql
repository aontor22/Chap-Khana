-- Run only when upgrading a database that already has the original Chap Khana schema.
-- It preserves existing orders/menu/staff and adds Google-customer order history.
BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_customer_user_idx ON public.orders (customer_user_id, created_at DESC);
DROP POLICY IF EXISTS "customers read own orders" ON public.orders;
CREATE POLICY "customers read own orders" ON public.orders FOR SELECT TO authenticated
  USING (customer_user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "customers read own items" ON public.order_items;
CREATE POLICY "customers read own items" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_user_id = (SELECT auth.uid())));

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
    v_subtotal := v_subtotal + v_menu.price * v_line.qty;
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
    insert into public.order_items(order_id,menu_item_id,item_name,unit_price,qty,line_total)
    values(v_order_id,v_menu.id,v_menu.name,v_menu.price,v_line.qty,v_menu.price*v_line.qty);
  end loop;
  return jsonb_build_object('code',v_code,'tracking_token',v_token,'total',v_subtotal+v_fee);
end;
$$;


COMMIT;
