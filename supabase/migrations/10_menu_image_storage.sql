-- Chap Khana v3.9.0: Admin-only menu image uploads.
-- Apply after 01/03/04/05/06/07/08. 09 Realtime migration is independent.
-- Creates a public-read bucket for restaurant menu photos. Only authenticated
-- members of public.admin_users can upload or delete objects in this bucket.
-- Non-destructive: does not edit menu_items, orders, prices or discounts.
-- The Supabase Storage schema must be provisioned by Supabase Cloud.
BEGIN;

DO $check$
BEGIN
  IF to_regclass('public.admin_users') IS NULL THEN
    RAISE EXCEPTION 'public.admin_users not found: apply base schema before storage migration';
  END IF;
  IF to_regclass('public.menu_items') IS NULL THEN
    RAISE EXCEPTION 'public.menu_items not found: apply menu migration first';
  END IF;
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Supabase Storage is unavailable. This migration needs a Supabase project with Storage enabled.';
  END IF;
END;
$check$;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('chap-khana-menu-images','chap-khana-menu-images',true,3145728,ARRAY['image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Supabase Storage creates the storage.objects table with RLS enabled.
-- Paths must have shape items/<menu-item-id>/<generated-uuid>.webp.
-- No UPDATE policy: each replacement creates a new unique object.
DO $policies$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='chap_khana_staff_menu_photo_insert') THEN
    CREATE POLICY chap_khana_staff_menu_photo_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'chap-khana-menu-images'
      AND name ~ '^items/[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f-]{36}\.webp$'
      AND EXISTS (
        SELECT 1 FROM public.admin_users au
        WHERE au.user_id = (SELECT auth.uid())
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='chap_khana_staff_menu_photo_select') THEN
    CREATE POLICY chap_khana_staff_menu_photo_select ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'chap-khana-menu-images'
      AND EXISTS (
        SELECT 1 FROM public.admin_users au
        WHERE au.user_id = (SELECT auth.uid())
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='chap_khana_staff_menu_photo_delete') THEN
    CREATE POLICY chap_khana_staff_menu_photo_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'chap-khana-menu-images'
      AND name ~ '^items/[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f-]{36}\.webp$'
      AND EXISTS (
        SELECT 1 FROM public.admin_users au
        WHERE au.user_id = (SELECT auth.uid())
      )
    );
  END IF;
END;
$policies$;
COMMIT;

-- Optional verification (run separately):
-- SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='chap-khana-menu-images';
-- SELECT policyname,cmd,roles FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'chap_khana_staff_menu_photo_%';
-- Upload tests must be performed while signed in as approved staff (not SQL Editor's privileged role).
