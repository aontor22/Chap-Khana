-- Chap Khana v3.6.0 / Phase 1: security and launch-readiness fixes.
-- Run ONCE after 01, 03, 04, 05, 06 and 07 on the existing Supabase project.
-- Non-destructive. No tables, customers, menu items, pricing or orders are rewritten.
-- Back up the live database and first run this migration in a staging project.
BEGIN;

-- Refuse a partial/incorrect migration sequence rather than silently leaving
-- an application with nonfunctional ordering or restaurant-settings saves.
DO $check_dependencies$
BEGIN
  IF to_regprocedure('private.is_valid_weekly_hours(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Apply 07_restaurant_profile_hours.sql before 08_launch_security.sql';
  END IF;
  IF to_regprocedure('public.place_order_v2(text,text,text,text,text,jsonb,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply 03_production_hardening.sql and 06_item_discounts.sql before 08';
  END IF;
  IF to_regprocedure('public.place_order(text,text,text,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Base schema missing legacy order function; review installed migrations';
  END IF;
END;
$check_dependencies$;

-- Migration 07 revoked the ability for authenticated users to execute the
-- pure weekly-hours validator referenced by a CHECK constraint. This grant
-- allows an authenticated staff member's UPDATE to run that validation.
-- The store_settings UPDATE permission remains restricted by staff-only RLS.
GRANT EXECUTE ON FUNCTION private.is_valid_weekly_hours(jsonb) TO authenticated;

-- The legacy 6-argument public RPC from 01 was still callable after v2 was
-- introduced. It bypasses v2's request idempotency and phone rate cap.
-- Deny legacy client calls, keeping the canonical 7-argument RPC available.
REVOKE EXECUTE ON FUNCTION public.place_order(text,text,text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.place_order_impl(text,text,text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;

-- Lock down status-only updates, in case the original broad UPDATE grant was
-- accidentally re-applied during a prior database upgrade. RLS separately
-- requires admin_users membership for every order update.
REVOKE UPDATE ON TABLE public.orders FROM anon, authenticated;
GRANT UPDATE(status) ON TABLE public.orders TO authenticated;

-- Explicitly ensure the secured v2 RPC remains available to customers/guests.
GRANT EXECUTE ON FUNCTION public.place_order_v2(text,text,text,text,text,jsonb,uuid)
  TO anon, authenticated;

-- Verify critical ACL properties while the transaction can still roll back.
DO $verify$
BEGIN
  IF has_function_privilege('anon','public.place_order(text,text,text,text,text,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.place_order(text,text,text,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Legacy order RPC remains exposed; rolling back';
  END IF;
  IF NOT has_function_privilege('anon','public.place_order_v2(text,text,text,text,text,jsonb,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'V2 order RPC unavailable; rolling back';
  END IF;
  IF NOT has_function_privilege('authenticated','private.is_valid_weekly_hours(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Admin opening-hours validation permission not applied';
  END IF;
  IF has_column_privilege('authenticated','public.orders','total','UPDATE')
    OR has_column_privilege('authenticated','public.orders','customer_phone','UPDATE') THEN
    RAISE EXCEPTION 'Order amount/customer data still writable; rolling back';
  END IF;
END;
$verify$;
COMMIT;

-- Notes:
-- 1. This does not provide IP-based abuse prevention or bot protection.
-- 2. Existing orders retain their original amounts and tracking tokens.
-- 3. For live checks see docs/SECURITY-PHASE1-v3.6-BN.md.
