-- Chap Khana v3.12: Staff-only aggregate sales reporting.
-- Apply after base schema + discount migration 06 + security migration 08.
-- No historical order rows or menu data are changed.
-- IMPORTANT: Completed order value is not proof of PAYMENT COLLECTION.
BEGIN;

-- Fail early if the discount snapshot schema is not present.
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items' AND column_name='discount_unit_amount'
  ) THEN
    RAISE EXCEPTION 'Apply 06_item_discounts.sql before 11_staff_sales_analytics.sql';
  END IF;
END;
$check$;

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
    SELECT o.id,o.created_at,o.status,o.total,o.subtotal,o.delivery_fee,
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
    SELECT COALESCE(SUM(savings),0) AS savings,COALESCE(SUM(qty),0) AS units
    FROM item_rollup
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
    SELECT local_day,COALESCE(SUM(savings),0) AS savings
    FROM item_rollup GROUP BY local_day
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

REVOKE ALL ON FUNCTION public.staff_sales_report(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_sales_report(date,date) TO authenticated;

-- Useful bounded range index; safe to recreate.
CREATE INDEX IF NOT EXISTS orders_analytics_created_status_idx ON public.orders(created_at,status);

COMMIT;

-- Verification (run in SQL Editor):
-- SELECT has_function_privilege('anon','public.staff_sales_report(date,date)','EXECUTE') AS guest_allowed,
--        has_function_privilege('authenticated','public.staff_sales_report(date,date)','EXECUTE') AS signed_in_allowed;
-- Expected: false / true. Function performs a SECOND admin_users authorization check.
