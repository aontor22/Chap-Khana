-- Chap Khana v3.19.0 — Kitchen Display System
-- Requires the existing order status validator and audit from migration 03.
-- Safe additive migration: no order, inventory, loyalty, or payment values changed.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.orders') IS NULL OR
     to_regclass('public.order_status_events') IS NULL OR
     to_regprocedure('private.is_staff()') IS NULL OR
     NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='validate_order_status_trigger' AND NOT tgisinternal) OR
     NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='record_order_status_trigger' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Run the core restaurant and status audit migrations first';
  END IF;
END $$;

-- Atomic compare-and-set: prevents staff devices from advancing stale orders.
-- Existing stock, loyalty and status-audit triggers execute as usual.
-- Staff can use ordinary Order Management for exceptional cancellations.
CREATE OR REPLACE FUNCTION public.kitchen_advance_order(
  p_order uuid, p_expected_status text, p_next_status text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_status text; v_fulfillment text; v_allowed text;
BEGIN
  IF NOT (SELECT private.is_staff()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
  IF p_order IS NULL OR p_expected_status IS NULL OR p_next_status IS NULL THEN
    RAISE EXCEPTION 'Order ID and statuses are required';
  END IF;
  SELECT status::text,fulfillment_type::text INTO v_status,v_fulfillment
    FROM public.orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_status<>p_expected_status THEN
    RAISE EXCEPTION 'This order was updated elsewhere. Refresh the kitchen board.';
  END IF;
  v_allowed:=CASE v_status
    WHEN 'pending' THEN 'confirmed'
    WHEN 'confirmed' THEN 'preparing'
    WHEN 'preparing' THEN 'ready'
    WHEN 'ready' THEN CASE WHEN v_fulfillment='delivery' THEN 'out_for_delivery' ELSE 'completed' END
    WHEN 'out_for_delivery' THEN 'completed'
    ELSE NULL
  END;
  IF v_allowed IS NULL OR p_next_status<>v_allowed THEN
    RAISE EXCEPTION 'Invalid kitchen status transition';
  END IF;
  UPDATE public.orders SET status=p_next_status WHERE id=p_order;
  RETURN p_next_status;
END; $$;
REVOKE ALL ON FUNCTION public.kitchen_advance_order(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_advance_order(uuid,text,text) TO authenticated;
COMMIT;
