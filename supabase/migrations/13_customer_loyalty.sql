-- Chap Khana v3.14.0 - Loyalty points (optional, OFF by default).
-- Prerequisites: migrations 01-12, especially 03, 06 and 12.
-- Apply in staging before production. Existing order rows are NOT backfilled.
BEGIN;
DO $ready$ BEGIN
  IF to_regprocedure('public.place_order_v3(text,text,text,text,text,jsonb,uuid,text)') IS NULL
     OR to_regprocedure('private.place_order_v2_impl(text,text,text,text,text,jsonb,uuid)') IS NULL
     OR to_regclass('public.coupon_campaigns') IS NULL THEN
    RAISE EXCEPTION 'Apply Chap Khana SQL migrations 01-12 before loyalty migration 13';
  END IF;
END $ready$;

CREATE TABLE IF NOT EXISTS public.loyalty_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
 enabled boolean NOT NULL DEFAULT false,
 points_per_100_bdt integer NOT NULL DEFAULT 1 CHECK (points_per_100_bdt BETWEEN 1 AND 50),
 bdt_per_point integer NOT NULL DEFAULT 1 CHECK (bdt_per_point BETWEEN 1 AND 10),
 minimum_redeem_points integer NOT NULL DEFAULT 50 CHECK (minimum_redeem_points BETWEEN 1 AND 100000),
 max_redeem_percent integer NOT NULL DEFAULT 20 CHECK (max_redeem_percent BETWEEN 1 AND 50),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.loyalty_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 balance integer NOT NULL DEFAULT 0 CHECK(balance>=0),
 lifetime_earned integer NOT NULL DEFAULT 0 CHECK(lifetime_earned>=0),
 lifetime_redeemed integer NOT NULL DEFAULT 0 CHECK(lifetime_redeemed>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.loyalty_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('earn','redeem','refund')),
 points integer NOT NULL CHECK (points>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,kind)
);
CREATE INDEX IF NOT EXISTS loyalty_events_user_idx ON public.loyalty_events(user_id,created_at DESC);
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loyalty_settings,public.loyalty_accounts,public.loyalty_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.loyalty_settings,public.loyalty_accounts,public.loyalty_events TO authenticated;
GRANT UPDATE (enabled,points_per_100_bdt,bdt_per_point,minimum_redeem_points,max_redeem_percent,updated_at)
  ON public.loyalty_settings TO authenticated;
DROP POLICY IF EXISTS "loyalty settings signed in read" ON public.loyalty_settings;
CREATE POLICY "loyalty settings signed in read" ON public.loyalty_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "loyalty settings staff update" ON public.loyalty_settings;
CREATE POLICY "loyalty settings staff update" ON public.loyalty_settings FOR UPDATE TO authenticated
 USING ((SELECT private.is_staff())) WITH CHECK ((SELECT private.is_staff()));
DROP POLICY IF EXISTS "loyalty wallet own read" ON public.loyalty_accounts;
CREATE POLICY "loyalty wallet own read" ON public.loyalty_accounts FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "loyalty events own read" ON public.loyalty_events;
CREATE POLICY "loyalty events own read" ON public.loyalty_events FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()));
-- There are intentionally NO INSERT / UPDATE / DELETE grants or policies on wallet / ledger.

ALTER TABLE public.orders
 ADD COLUMN IF NOT EXISTS loyalty_points_redeemed integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS loyalty_discount integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS loyalty_points_earned integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_total_coupon_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_total_loyalty_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_total_loyalty_check CHECK (
 coupon_discount>=0 AND coupon_discount<subtotal AND
 loyalty_discount>=0 AND loyalty_discount+coupon_discount<subtotal AND
 loyalty_points_redeemed>=0 AND loyalty_points_earned>=0 AND
 ((loyalty_discount=0 AND loyalty_points_redeemed=0) OR (loyalty_discount>0 AND loyalty_points_redeemed>0)) AND
 ((coupon_code IS NULL AND coupon_discount=0) OR (coupon_code IS NOT NULL AND coupon_discount>0)) AND
 total=subtotal+delivery_fee-coupon_discount-loyalty_discount
);

-- Redeeming cannot be performed by direct table writes. Caller must have a real user session.
CREATE OR REPLACE FUNCTION private.place_order_v4_impl(
 p_name text,p_phone text,p_type text,p_address text,p_notes text,
 p_items jsonb,p_request_id uuid,p_coupon text,p_redeem_points integer
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid := auth.uid();v_order public.orders%ROWTYPE;
 v_wallet public.loyalty_accounts%ROWTYPE;v_settings public.loyalty_settings%ROWTYPE;
 v_coupon text:=nullif(upper(trim(coalesce(p_coupon,''))),'');
 v_receipt jsonb;v_eligible integer;v_discount integer;v_max_discount integer;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to redeem loyalty points'; END IF;
 IF p_request_id IS NULL OR p_redeem_points IS NULL OR p_redeem_points<1 OR p_redeem_points>100000 THEN
   RAISE EXCEPTION 'Invalid points amount'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 SELECT * INTO v_order FROM public.orders WHERE client_request_id=p_request_id;
 IF FOUND THEN
   -- v2 validates the prior order session; never reserve points twice on retries.
   v_receipt:=private.place_order_v2_impl(p_name,p_phone,p_type,p_address,p_notes,p_items,p_request_id);
   RETURN v_receipt || pg_catalog.jsonb_build_object('coupon_code',v_order.coupon_code,
     'coupon_discount',v_order.coupon_discount,'loyalty_points_redeemed',v_order.loyalty_points_redeemed,
     'loyalty_discount',v_order.loyalty_discount);
 END IF;
 SELECT * INTO v_settings FROM public.loyalty_settings WHERE id=1;
 IF NOT FOUND OR NOT v_settings.enabled THEN RAISE EXCEPTION 'Rewards redemption is currently unavailable'; END IF;
 IF p_redeem_points<v_settings.minimum_redeem_points THEN RAISE EXCEPTION 'Minimum redeemable points not met'; END IF;
 INSERT INTO public.loyalty_accounts(user_id) VALUES (v_user) ON CONFLICT(user_id) DO NOTHING;
 SELECT * INTO v_wallet FROM public.loyalty_accounts WHERE user_id=v_user FOR UPDATE;
 IF NOT FOUND OR v_wallet.balance<p_redeem_points THEN RAISE EXCEPTION 'Insufficient points'; END IF;
 -- Reuse existing trusted checkout and coupon validation. Any failure rolls back everything.
 IF v_coupon IS NOT NULL THEN
   v_receipt:=private.place_order_v3_impl(p_name,p_phone,p_type,p_address,p_notes,p_items,p_request_id,v_coupon);
 ELSE
   v_receipt:=private.place_order_v2_impl(p_name,p_phone,p_type,p_address,p_notes,p_items,p_request_id);
 END IF;
 SELECT * INTO v_order FROM public.orders WHERE client_request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_order.customer_user_id IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'Order account mismatch'; END IF;
 v_eligible:=v_order.subtotal-v_order.coupon_discount;
 v_max_discount:=LEAST(v_eligible-1,pg_catalog.floor(v_eligible::numeric*v_settings.max_redeem_percent/100)::integer);
 v_discount:=p_redeem_points*v_settings.bdt_per_point;
 IF v_discount<1 OR v_discount>v_max_discount THEN RAISE EXCEPTION 'Points exceed order redemption limit'; END IF;
 UPDATE public.orders SET loyalty_points_redeemed=p_redeem_points,
    loyalty_discount=v_discount,total=v_order.total-v_discount WHERE id=v_order.id;
 UPDATE public.loyalty_accounts SET balance=balance-p_redeem_points,
    lifetime_redeemed=lifetime_redeemed+p_redeem_points,updated_at=now() WHERE user_id=v_user;
 INSERT INTO public.loyalty_events(user_id,order_id,kind,points)
 VALUES(v_user,v_order.id,'redeem',p_redeem_points);
 RETURN v_receipt || pg_catalog.jsonb_build_object('total',v_order.total-v_discount,
   'coupon_code',v_order.coupon_code,'coupon_discount',v_order.coupon_discount,
   'loyalty_points_redeemed',p_redeem_points,'loyalty_discount',v_discount);
END;
$$;
REVOKE ALL ON FUNCTION private.place_order_v4_impl(text,text,text,text,text,jsonb,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.place_order_v4_impl(text,text,text,text,text,jsonb,uuid,text,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.place_order_v4(
 p_name text,p_phone text,p_type text,p_address text,p_notes text,
 p_items jsonb,p_request_id uuid,p_coupon text,p_redeem_points integer
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.place_order_v4_impl(p_name,p_phone,p_type,p_address,p_notes,p_items,p_request_id,p_coupon,p_redeem_points);
$$;
REVOKE ALL ON FUNCTION public.place_order_v4(text,text,text,text,text,jsonb,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.place_order_v4(text,text,text,text,text,jsonb,uuid,text,integer) TO authenticated;

-- Triggered ONLY on real status changes by the existing staff-only order status path.
-- Completion credits once; cancellation refunds reserved points once, even if program is disabled.
CREATE OR REPLACE FUNCTION private.apply_loyalty_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_rules public.loyalty_settings%ROWTYPE;v_points integer;v_event bigint;
BEGIN
 IF NEW.customer_user_id IS NULL OR NEW.status=OLD.status THEN RETURN NEW; END IF;
 IF NEW.status='completed' AND OLD.status<>'completed' THEN
   SELECT * INTO v_rules FROM public.loyalty_settings WHERE id=1;
   IF NOT FOUND OR NOT v_rules.enabled THEN RETURN NEW; END IF;
   v_points:=pg_catalog.floor(GREATEST(0,NEW.subtotal-NEW.coupon_discount-NEW.loyalty_discount)::numeric/100)::integer * v_rules.points_per_100_bdt;
   IF v_points>0 THEN
     INSERT INTO public.loyalty_accounts(user_id) VALUES (NEW.customer_user_id) ON CONFLICT(user_id) DO NOTHING;
     INSERT INTO public.loyalty_events(user_id,order_id,kind,points)
       VALUES(NEW.customer_user_id,NEW.id,'earn',v_points) ON CONFLICT(order_id,kind) DO NOTHING RETURNING id INTO v_event;
     IF v_event IS NOT NULL THEN
       UPDATE public.loyalty_accounts SET balance=balance+v_points,
         lifetime_earned=lifetime_earned+v_points,updated_at=now() WHERE user_id=NEW.customer_user_id;
       UPDATE public.orders SET loyalty_points_earned=v_points WHERE id=NEW.id;
     END IF;
   END IF;
 ELSIF NEW.status='cancelled' AND OLD.status<>'cancelled' AND NEW.loyalty_points_redeemed>0 THEN
   INSERT INTO public.loyalty_accounts(user_id) VALUES (NEW.customer_user_id) ON CONFLICT(user_id) DO NOTHING;
   INSERT INTO public.loyalty_events(user_id,order_id,kind,points)
     VALUES(NEW.customer_user_id,NEW.id,'refund',NEW.loyalty_points_redeemed)
     ON CONFLICT(order_id,kind) DO NOTHING RETURNING id INTO v_event;
   IF v_event IS NOT NULL THEN
     UPDATE public.loyalty_accounts SET balance=balance+NEW.loyalty_points_redeemed,
       lifetime_redeemed=lifetime_redeemed-NEW.loyalty_points_redeemed,updated_at=now()
       WHERE user_id=NEW.customer_user_id;
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.apply_loyalty_status_change() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS loyalty_status_change_trigger ON public.orders;
CREATE TRIGGER loyalty_status_change_trigger AFTER UPDATE OF status ON public.orders
 FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
 EXECUTE FUNCTION private.apply_loyalty_status_change();
-- Reporting: loyalty savings add to coupon and item savings; dish-level amounts remain item-only.
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
    SELECT o.id,o.created_at,o.status,o.total,o.subtotal,o.delivery_fee,o.coupon_discount,o.loyalty_discount,
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
      COALESCE((SELECT SUM(coupon_discount+loyalty_discount) FROM completed),0) AS savings,
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
    LEFT JOIN (SELECT local_day,SUM(coupon_discount+loyalty_discount) AS amount FROM completed GROUP BY local_day) coupons USING(local_day)
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

DO $permissions$ BEGIN
 IF has_table_privilege('authenticated','public.loyalty_accounts','UPDATE') OR
    has_table_privilege('authenticated','public.loyalty_events','INSERT') OR
    has_function_privilege('anon','public.place_order_v4(text,text,text,text,text,jsonb,uuid,text,integer)','EXECUTE') THEN
  RAISE EXCEPTION 'Invalid loyalty access permissions';
 END IF;
END $permissions$;
COMMIT;
