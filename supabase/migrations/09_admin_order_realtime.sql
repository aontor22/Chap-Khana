-- Chap Khana v3.7: optional Realtime order stream for staff dashboard.
-- Recommended sequence: complete 08_launch_security.sql first.
-- Non-destructive, can be run later. The dashboard will poll without it.
-- The existing SELECT RLS policy restricts private order rows to approved
-- staff and customers reading only their own orders. Do NOT make orders public.
BEGIN;
DO $migration$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'Missing public.orders: apply the existing database schema first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'Supabase Realtime publication not found; check project configuration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END;
$migration$;
COMMIT;

-- Verification:
-- SELECT schemaname, tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename = 'orders';
-- Realtime changes are still subject to public.orders SELECT RLS.
-- Never add anon SELECT grants or bypass the admin_users allowlist.
