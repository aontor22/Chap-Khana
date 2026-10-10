-- Chap Khana v3.5.0: restaurant profile, weekly hours and social links.
-- Run after 01, 03, 04, 05, 06 on an existing Chap Khana project.
-- Non-destructive: orders, catalog, discounts, permissions and existing data stay intact.
-- This migration does NOT automatically pause/enable online checkout outside hours.
BEGIN;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '01870-203065',
  ADD COLUMN IF NOT EXISTS whatsapp_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_text text NOT NULL DEFAULT 'Namapara Road, Khilkhet, Dhaka',
  ADD COLUMN IF NOT EXISTS maps_url text NOT NULL DEFAULT 'https://maps.app.goo.gl/gjk9EttHXfm8X51v6',
  ADD COLUMN IF NOT EXISTS facebook_url text NOT NULL DEFAULT 'https://www.facebook.com/chapkhana',
  ADD COLUMN IF NOT EXISTS instagram_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hours_note text NOT NULL DEFAULT 'Opening hours shown are from the supplied Google Maps listing; please confirm before visiting.',
  ADD COLUMN IF NOT EXISTS announcement text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dine_in_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_hours jsonb NOT NULL DEFAULT '{
    "monday":{"open":"11:59","close":"23:59","closed":false},
    "tuesday":{"open":"11:59","close":"23:59","closed":false},
    "wednesday":{"open":"11:59","close":"23:59","closed":false},
    "thursday":{"open":"11:59","close":"23:59","closed":false},
    "friday":{"open":"11:59","close":"23:59","closed":false},
    "saturday":{"open":"11:59","close":"23:59","closed":false},
    "sunday":{"open":"11:59","close":"23:59","closed":false}
  }'::jsonb;

-- PostgreSQL CHECK constraints must validate records independent of browser JS.
CREATE OR REPLACE FUNCTION private.is_valid_weekly_hours(p_hours jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_hours IS NULL OR jsonb_typeof(p_hours) IS DISTINCT FROM 'object' THEN false
  ELSE (
    (SELECT count(*) FROM jsonb_object_keys(p_hours)) = 7
    AND NOT EXISTS (
      SELECT 1 FROM unnest(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) AS day_name
      WHERE jsonb_typeof(p_hours->day_name) IS DISTINCT FROM 'object'
      OR jsonb_typeof(p_hours->day_name->'closed') IS DISTINCT FROM 'boolean'
      OR coalesce(p_hours->day_name->>'open','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR coalesce(p_hours->day_name->>'close','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR ((p_hours->day_name->>'closed')::boolean = false
          AND p_hours->day_name->>'open' = p_hours->day_name->>'close')
    )
  ) END;
$$;
REVOKE ALL ON FUNCTION private.is_valid_weekly_hours(jsonb) FROM PUBLIC, anon, authenticated;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.store_settings'::regclass AND conname='store_settings_profile_valid') THEN
    ALTER TABLE public.store_settings ADD CONSTRAINT store_settings_profile_valid CHECK (
      char_length(contact_phone) BETWEEN 7 AND 24
      AND char_length(whatsapp_phone) <= 24
      AND char_length(address_text) BETWEEN 1 AND 250
      AND char_length(maps_url) BETWEEN 9 AND 500 AND maps_url LIKE 'https://%'
      AND (facebook_url='' OR (char_length(facebook_url)<=500 AND facebook_url LIKE 'https://%'))
      AND (instagram_url='' OR (char_length(instagram_url)<=500 AND instagram_url LIKE 'https://%'))
      AND char_length(hours_note)<=300
      AND char_length(announcement)<=240
      AND private.is_valid_weekly_hours(weekly_hours)
    );
  END IF;
END;
$constraints$;

-- Existing RLS SELECT/UPDATE staff allowlist policies remain unchanged.
-- Neither the anon role nor public visitors receive UPDATE privileges.
-- Deliberately no DDL to alter order status, order pricing, or security grants.
COMMIT;

-- Optional verification, run separately:
-- SELECT contact_phone,address_text,maps_url,facebook_url,weekly_hours
-- FROM public.store_settings WHERE id=1;
