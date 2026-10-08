-- Chap Khana React upgrade. Run AFTER 01_fresh_schema.sql on a NEW project,
-- OR after 02_existing_google_upgrade.sql when upgrading an OLD Chap Khana database.
-- Non-destructive: preserves existing menu, accounts, historical orders.
BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_request_id uuid;
CREATE INDEX IF NOT EXISTS orders_phone_created_idx ON public.orders(customer_phone,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS orders_client_request_unique
  ON public.orders(client_request_id) WHERE client_request_id IS NOT NULL;

-- Fix the old broad UPDATE grant: staff must not edit amount, owner, or customer fields.
REVOKE UPDATE ON public.orders FROM authenticated;
GRANT UPDATE(status) ON public.orders TO authenticated;

-- Immutable append-only staff order-status history.
CREATE TABLE IF NOT EXISTS public.order_status_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_status text NOT NULL,
  next_status text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_lookup_idx ON public.order_status_events(order_id,changed_at DESC);
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_status_events FROM anon, authenticated;
GRANT SELECT ON public.order_status_events TO authenticated;
DROP POLICY IF EXISTS "staff see status audit" ON public.order_status_events;
CREATE POLICY "staff see status audit" ON public.order_status_events FOR SELECT TO authenticated
  USING ((SELECT private.is_staff()));
DROP POLICY IF EXISTS "customers see own status audit" ON public.order_status_events;
CREATE POLICY "customers see own status audit" ON public.order_status_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.customer_user_id=(SELECT auth.uid())));

CREATE OR REPLACE FUNCTION private.validate_order_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status='pending' AND NEW.status IN ('confirmed','cancelled')) OR
    (OLD.status='confirmed' AND NEW.status IN ('preparing','cancelled')) OR
    (OLD.status='preparing' AND NEW.status IN ('ready','out_for_delivery','cancelled')) OR
    (OLD.status='ready' AND NEW.status IN ('out_for_delivery','completed','cancelled')) OR
    (OLD.status='out_for_delivery' AND NEW.status IN ('completed','cancelled'))
  ) THEN RAISE EXCEPTION 'Invalid order status transition (% -> %)',OLD.status,NEW.status; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION private.record_order_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_events(order_id,actor_user_id,previous_status,next_status)
    VALUES(NEW.id,auth.uid(),OLD.status,NEW.status);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_order_status_trigger ON public.orders;
CREATE TRIGGER validate_order_status_trigger BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.validate_order_status();
DROP TRIGGER IF EXISTS record_order_status_trigger ON public.orders;
CREATE TRIGGER record_order_status_trigger AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.record_order_status();
REVOKE ALL ON FUNCTION private.validate_order_status() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.record_order_status() FROM PUBLIC,anon,authenticated;

-- Idempotent order placement; old price-validated implementation remains the source
-- of truth. Same client_request_id returns the same receipt on a network retry.
CREATE OR REPLACE FUNCTION private.place_order_v2_impl(
  p_name text,p_phone text,p_type text,p_address text,p_notes text,p_items jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_existing public.orders%ROWTYPE; v_result jsonb;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Missing request ID.'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  SELECT * INTO v_existing FROM public.orders WHERE client_request_id=p_request_id LIMIT 1;
  IF FOUND THEN
    -- The idempotency key is a secret bearer value. Only the original session
    -- (when signed in) may reclaim its receipt. Guests must save their receipt.
    IF v_existing.customer_user_id IS NOT NULL AND v_existing.customer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'This request ID belongs to another account.';
    END IF;
    RETURN pg_catalog.jsonb_build_object('code',v_existing.code,'tracking_token',v_existing.tracking_token,'total',v_existing.total);
  END IF;
  -- Lightweight rate limit for repeat orders using one phone number.
  -- This is NOT a substitute for edge/IP-based abuse prevention and CAPTCHA.
  IF (SELECT count(*) FROM public.orders
      WHERE customer_phone=pg_catalog.regexp_replace(p_phone,'[\s-]','','g')
        AND created_at>now()-interval '15 minutes') >= 3 THEN
    RAISE EXCEPTION 'Order limit reached. Please contact the restaurant.';
  END IF;
  v_result := private.place_order_impl(p_name,p_phone,p_type,p_address,p_notes,p_items);
  UPDATE public.orders SET client_request_id=p_request_id
    WHERE tracking_token=(v_result->>'tracking_token')::uuid;
  RETURN v_result;
END;
$$;
CREATE OR REPLACE FUNCTION public.place_order_v2(
  p_name text,p_phone text,p_type text,p_address text,p_notes text,p_items jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
  SELECT private.place_order_v2_impl(p_name,p_phone,p_type,p_address,p_notes,p_items,p_request_id)
$$;
REVOKE ALL ON FUNCTION private.place_order_v2_impl(text,text,text,text,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.place_order_v2(text,text,text,text,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.place_order_v2_impl(text,text,text,text,text,jsonb,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.place_order_v2(text,text,text,text,text,jsonb,uuid) TO anon,authenticated;

-- No DROP TABLE, TRUNCATE, or destructive data migration in this file.
COMMIT;
