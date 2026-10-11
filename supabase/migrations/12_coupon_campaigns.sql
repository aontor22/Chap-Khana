-- Chap Khana v3.13: Coupon campaigns (server-side, transactional).
-- Apply AFTER 06_item_discounts.sql, 08_launch_security.sql and 11_staff_sales_analytics.sql.
-- NO existing rows are repriced. Discount is an order-level snapshot.
-- Apply/test on staging first; existing public.place_order_v2 remains intact.
BEGIN;

DO $requirements$ BEGIN
  IF to_regprocedure('public.place_order_v2(text,text,text,text,text,jsonb,uuid)') IS NULL OR
     to_regprocedure('public.staff_sales_report(date,date)') IS NULL THEN
    RAISE EXCEPTION 'Apply earlier SQL migrations through 11 before coupon migration 12';
  END IF;
END; $requirements$;

CREATE TABLE IF NOT EXISTS public.coupon_campaigns (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$'),
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value integer NOT NULL CHECK (discount_value > 0 AND
    (discount_type <> 'percent' OR discount_value < 100)),
  min_subtotal integer NOT NULL DEFAULT 0 CHECK (min_subtotal BETWEEN 0 AND 999999),
  max_discount integer CHECK (max_discount IS NULL OR max_discount > 0),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_time_valid CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE RESTRICT,
  coupon_code text NOT NULL REFERENCES public.coupon_campaigns(code),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  discount_amount integer NOT NULL CHECK (discount_amount > 0),
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coupon_redemptions_campaign_idx ON public.coupon_redemptions(coupon_code,redeemed_at);
ALTER TABLE public.coupon_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coupon_campaigns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.coupon_redemptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.coupon_campaigns TO authenticated;
GRANT UPDATE (discount_type,discount_value,min_subtotal,max_discount,max_uses,starts_at,ends_at,active)
  ON public.coupon_campaigns TO authenticated;
GRANT SELECT ON public.coupon_redemptions TO authenticated;
DROP POLICY IF EXISTS "staff manage coupon campaigns" ON public.coupon_campaigns;
CREATE POLICY "staff manage coupon campaigns" ON public.coupon_campaigns
  FOR ALL TO authenticated USING ((SELECT private.is_staff())) WITH CHECK ((SELECT private.is_staff()));
DROP POLICY IF EXISTS "staff read coupon redemptions" ON public.coupon_redemptions;
CREATE POLICY "staff read coupon redemptions" ON public.coupon_redemptions
  FOR SELECT TO authenticated USING ((SELECT private.is_staff()));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_code text REFERENCES public.coupon_campaigns(code),
  ADD COLUMN IF NOT EXISTS coupon_discount integer NOT NULL DEFAULT 0;
-- The original constraint comes from 01_fresh_schema.sql (orders_total_check).
-- The replacement preserves the same invariant for all existing coupon-free orders.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_total_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_total_coupon_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_total_coupon_check CHECK (
  coupon_discount >= 0 AND coupon_discount < subtotal AND
  total = subtotal + delivery_fee - coupon_discount AND
  ((coupon_code IS NULL AND coupon_discount = 0) OR (coupon_code IS NOT NULL AND coupon_discount > 0))
);

CREATE OR REPLACE FUNCTION private.valid_coupon_amount(
  p_type text,p_value integer,p_cap integer,p_subtotal integer
) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_subtotal <= 1 THEN 0 ELSE
    GREATEST(0,LEAST(p_subtotal-1,COALESCE(p_cap,2147483647),
      CASE WHEN p_type='percent' THEN ROUND(p_subtotal::numeric*p_value/100)::integer
           ELSE p_value END)) END;
$$;
REVOKE ALL ON FUNCTION private.valid_coupon_amount(text,integer,integer,integer) FROM PUBLIC,anon,authenticated;

-- Public quote never accepts a client-supplied total. Recalculate each dish using
-- live menu records and the already applied item-level discounts.
CREATE OR REPLACE FUNCTION private.quote_coupon_impl(p_code text,p_items jsonb,p_type text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_campaign public.coupon_campaigns%ROWTYPE;
  v_cfg public.store_settings%ROWTYPE;
  v_line record; v_menu public.menu_items%ROWTYPE;
  v_subtotal integer := 0; v_unit integer; v_amount integer;
BEGIN
  IF p_code IS NULL OR length(p_code) > 40 OR upper(trim(p_code)) !~ '^[A-Z0-9][A-Z0-9_-]{2,23}$' THEN
    RAISE EXCEPTION 'Coupon is invalid or unavailable';
  END IF;
  SELECT * INTO v_campaign FROM public.coupon_campaigns
    WHERE code=upper(trim(p_code)) AND active
    AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now())
    AND (max_uses IS NULL OR used_count < max_uses);
  IF NOT FOUND THEN RAISE EXCEPTION 'Coupon is invalid or unavailable'; END IF;
  SELECT * INTO v_cfg FROM public.store_settings WHERE id=1;
  IF NOT FOUND OR NOT v_cfg.accepting_orders OR
     p_type NOT IN ('pickup','delivery') OR
     (p_type='pickup' AND NOT v_cfg.pickup_enabled) OR
     (p_type='delivery' AND NOT v_cfg.delivery_enabled) THEN
    RAISE EXCEPTION 'Ordering method is unavailable';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Invalid items';
  END IF;
  IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Duplicate items';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_line.value)<>'object' OR jsonb_typeof(v_line.value->'id')<>'string' OR
       COALESCE(v_line.value->>'qty','') !~ '^([1-9]|1[0-9]|20)$' THEN
       RAISE EXCEPTION 'Invalid items';
    END IF;
    SELECT * INTO v_menu FROM public.menu_items WHERE id=v_line.value->>'id'
      AND active AND available AND price IS NOT NULL AND price>0;
    IF NOT FOUND THEN RAISE EXCEPTION 'An item is unavailable'; END IF;
    v_unit := CASE
      WHEN v_menu.discount_type='percent' THEN GREATEST(1,ROUND(v_menu.price::numeric*(100-v_menu.discount_value)/100)::integer)
      WHEN v_menu.discount_type='fixed' THEN v_menu.price-v_menu.discount_value
      ELSE v_menu.price END;
    v_subtotal := v_subtotal + v_unit*(v_line.value->>'qty')::integer;
  END LOOP;
  IF v_subtotal < v_campaign.min_subtotal THEN RAISE EXCEPTION 'Minimum basket value not reached'; END IF;
  v_amount := private.valid_coupon_amount(v_campaign.discount_type,v_campaign.discount_value,v_campaign.max_discount,v_subtotal);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Coupon cannot be applied to this basket'; END IF;
  RETURN jsonb_build_object('code',v_campaign.code,'discount',v_amount,'subtotal',v_subtotal,
    'total',v_subtotal+(CASE WHEN p_type='delivery' THEN v_cfg.delivery_fee ELSE 0 END)-v_amount);
END;
$$;
REVOKE ALL ON FUNCTION private.quote_coupon_impl(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.quote_coupon_impl(text,jsonb,text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.quote_coupon(p_code text,p_items jsonb,p_type text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT private.quote_coupon_impl(p_code,p_items,p_type)
$$;
REVOKE ALL ON FUNCTION public.quote_coupon(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quote_coupon(text,jsonb,text) TO anon,authenticated;

-- V3 keeps v2's request-id lock, phone rate limit, trusted price calculation,
-- idempotency and protected order insertion. Coupon logic is atomic with v2.
CREATE OR REPLACE FUNCTION private.place_order_v3_impl(
  p_name text,p_phone text,p_type text,p_address text,p_notes text,
  p_items jsonb,p_request_id uuid,p_coupon text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_campaign public.coupon_campaigns%ROWTYPE;
  v_existing public.orders%ROWTYPE; v_order public.orders%ROWTYPE;
  v_code text; v_amount integer; v_result jsonb;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Missing request ID'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  -- If a network retry already succeeded, never redeem another coupon.
  SELECT * INTO v_existing FROM public.orders WHERE client_request_id=p_request_id LIMIT 1;
  IF FOUND THEN
    v_result:=private.place_order_v2_impl(p_name,p_phone,p_type,p_address,p_notes,p_items,p_request_id);
    RETURN v_result || jsonb_build_object('coupon_code',v_existing.coupon_code,'coupon_discount',v_existing.coupon_discount);
  END IF;
  IF p_coupon IS NOT NULL AND trim(p_coupon)<>'' THEN
    v_code:=upper(trim(p_coupon));
    IF length(v_code)>40 OR v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,23}$' THEN
      RAISE EXCEPTION 'Coupon is invalid or unavailable';
    END IF;
    SELECT * INTO v_campaign FROM public.coupon_campaigns WHERE code=v_code FOR UPDATE;
    IF NOT FOUND OR NOT v_campaign.active OR
       (v_campaign.starts_at IS NOT NULL AND v_campaign.starts_at>now()) OR
       (v_campaign.ends_at IS NOT NULL AND v_campaign.ends_at<=now()) OR
       (v_campaign.max_uses IS NOT NULL AND v_campaign.used_count>=v_campaign.max_uses) THEN
      RAISE EXCEPTION 'Coupon is invalid or unavailable';
    END IF;
  END IF;
  v_result:=private.place_order_v2_impl(p_name,p_phone,p_type,p_address,p_notes,p_items,p_request_id);
  IF v_code IS NULL THEN RETURN v_result || jsonb_build_object('coupon_discount',0); END IF;
  SELECT * INTO v_order FROM public.orders WHERE client_request_id=p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order confirmation unavailable'; END IF;
  IF v_order.subtotal < v_campaign.min_subtotal THEN RAISE EXCEPTION 'Minimum basket value not reached'; END IF;
  v_amount:=private.valid_coupon_amount(v_campaign.discount_type,v_campaign.discount_value,v_campaign.max_discount,v_order.subtotal);
  IF v_amount<=0 THEN RAISE EXCEPTION 'Coupon cannot be applied to this basket'; END IF;
  UPDATE public.orders SET coupon_code=v_code,coupon_discount=v_amount,total=v_order.total-v_amount
    WHERE id=v_order.id;
  INSERT INTO public.coupon_redemptions(order_id,coupon_code,user_id,discount_amount)
    VALUES(v_order.id,v_code,auth.uid(),v_amount);
  UPDATE public.coupon_campaigns SET used_count=used_count+1 WHERE code=v_code;
  RETURN v_result || jsonb_build_object('total',v_order.total-v_amount,
     'coupon_code',v_code,'coupon_discount',v_amount);
END;
$$;
REVOKE ALL ON FUNCTION private.place_order_v3_impl(text,text,text,text,text,jsonb,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.place_order_v3_impl(text,text,text,text,text,jsonb,uuid,text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.place_order_v3(
  p_name text,p_phone text,p_type text,p_address text,p_notes text,
  p_items jsonb,p_request_id uuid,p_coupon text
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
  SELECT private.place_order_v3_impl(p_name,p_phone,p_type,p_address,p_notes,p_items,p_request_id,p_coupon)
$$;
REVOKE ALL ON FUNCTION public.place_order_v3(text,text,text,text,text,jsonb,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.place_order_v3(text,text,text,text,text,jsonb,uuid,text) TO anon,authenticated;

-- Include order-level coupon savings in completed totals and daily rollups.
-- Dish-level savings remain ITEM-only because coupon savings are basket-level.
CREATE OR REPLACE FUNCTION public.staff_sales_report(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE result jsonb;
BEGIN
  -- Explicitly authorize INSIDE the security-definer function; never rely
  -- solely on hiding a React button. No guest/customer report access.
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Staff authorization required' USING ERRCODE='42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 365 THEN
    RAISE EXCEPTION 'Choose a valid date range of at most 366 days';
  END IF;

  WITH selected AS MATERIALIZED (
    SELECT o.id,o.created_at,o.status,o.total,o.subtotal,o.delivery_fee,o.coupon_discount,
           (o.created_at AT TIME ZONE 'Asia/Dhaka')::date AS local_day
    FROM public.orders o
    WHERE o.created_at >= (p_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND o.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ),
  completed AS MATERIALIZED (
    SELECT * FROM selected WHERE status = 'completed'
  ),
  item_rollup AS MATERIALIZED (
    SELECT i.item_name, i.qty, i.line_total,
      GREATEST(0,COALESCE(i.discount_unit_amount,0)) * i.qty AS savings,
      c.local_day
    FROM completed c
    JOIN public.order_items i ON i.order_id = c.id
  ),
  stats AS (
    SELECT COUNT(*) AS orders,
      COUNT(*) FILTER (WHERE status='completed') AS completed,
      COUNT(*) FILTER (WHERE status='cancelled') AS cancelled,
      COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled')) AS active,
      COALESCE(SUM(total) FILTER (WHERE status='completed'),0) AS order_value,
      COALESCE(SUM(subtotal) FILTER (WHERE status='completed'),0) AS item_value,
      COALESCE(SUM(delivery_fee) FILTER (WHERE status='completed'),0) AS delivery_fees
    FROM selected
  ),
  savings_stats AS (
    SELECT COALESCE((SELECT SUM(savings) FROM item_rollup),0) +
      COALESCE((SELECT SUM(coupon_discount) FROM completed),0) AS savings,
      COALESCE((SELECT SUM(qty) FROM item_rollup),0) AS units
  ),
  daily_sales AS (
    SELECT local_day,
      COUNT(*) AS orders,
      COUNT(*) FILTER (WHERE status='completed') AS completed,
      COUNT(*) FILTER (WHERE status='cancelled') AS cancelled,
      COALESCE(SUM(total) FILTER (WHERE status='completed'),0) AS order_value
    FROM selected GROUP BY local_day
  ),
  daily_savings AS (
    SELECT ds.local_day,COALESCE(items.amount,0)+COALESCE(coupons.amount,0) AS savings
    FROM (SELECT DISTINCT local_day FROM completed) ds
    LEFT JOIN (SELECT local_day,SUM(savings) AS amount FROM item_rollup GROUP BY local_day) items USING(local_day)
    LEFT JOIN (SELECT local_day,SUM(coupon_discount) AS amount FROM completed GROUP BY local_day) coupons USING(local_day)
  ),
  dishes AS (
    SELECT item_name, SUM(qty) AS quantity,SUM(line_total) AS order_value,
      SUM(savings) AS savings FROM item_rollup
    GROUP BY item_name ORDER BY SUM(qty) DESC, item_name ASC LIMIT 100
  )
  SELECT jsonb_build_object(
    'from', p_from::text,'to',p_to::text,'timezone','Asia/Dhaka',
    'totals', (SELECT to_jsonb(stats)||to_jsonb(savings_stats) FROM stats CROSS JOIN savings_stats),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'day', d.local_day::text,'orders',d.orders,'completed',d.completed,
      'cancelled',d.cancelled,'order_value',d.order_value,'savings',COALESCE(s.savings,0)
    ) ORDER BY d.local_day) FROM daily_sales d LEFT JOIN daily_savings s USING(local_day)), '[]'::jsonb),
    'dishes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'name',item_name,'quantity',quantity,'order_value',order_value,'savings',savings)
      ORDER BY quantity DESC, item_name ASC) FROM dishes), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$fn$;


-- Fail closed if grants accidentally expose campaign records or ledger writes.
DO $validate$
BEGIN
  IF has_table_privilege('anon','public.coupon_campaigns','SELECT') OR
     has_table_privilege('authenticated','public.coupon_redemptions','INSERT') OR
     has_column_privilege('authenticated','public.coupon_campaigns','used_count','UPDATE') OR
     NOT has_function_privilege('anon','public.place_order_v3(text,text,text,text,text,jsonb,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Coupon access permissions invalid';
  END IF;
END; $validate$;
COMMIT;
