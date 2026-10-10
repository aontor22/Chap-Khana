# Chap Khana v3.5 — Restaurant Settings (Bangla)

## Updates
- Admin → Settings: Online ordering, pickup/delivery, delivery fee, dine-in.
- Restaurant phone, optional WhatsApp, address, Google Maps, Facebook, optional Instagram.
- Monday–Sunday opening/closing hours (Asia/Dhaka). Mark days closed; copy Monday schedule to all days.
- Public announcement banner and a separate hours note.
- Homepage and footer display current saved settings. The hours badge says **Scheduled open / Scheduled closed**, not that Google Maps has confirmed live operation.
- Public users cannot edit settings; existing `admin_users` staff allowlist and Supabase RLS continue to control saves.

## Critical database step
If SQL files 01, 03, 04, 05, 06 were previously successful, **only run this NEW SQL** in Supabase Dashboard → SQL Editor:

`supabase/migrations/07_restaurant_profile_hours.sql`

Run this **before** deploying the new React code. It uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and defaults, and does NOT reset menu, discounts, or orders. It does not change online ordering status or pricing.

Confirm:
```sql
SELECT id,contact_phone,address_text,maps_url,facebook_url,
       dine_in_enabled,weekly_hours,announcement,accepting_orders
FROM public.store_settings WHERE id=1;
```

## Deploy from Codespaces
If you upload `Chap-Khana-v3.5.0-Restaurant-Settings-Patch.zip` into `/workspaces/Chap-Khana`:

```bash
cd /workspaces/Chap-Khana
unzip -o Chap-Khana-v3.5.0-Restaurant-Settings-Patch.zip -d /tmp/chap-v35
rsync -av /tmp/chap-v35/Chap-Khana/ ./
npm install
npm run test:catalog
npm test
npm run build
git add -A
git commit -m "Add editable restaurant profile, opening hours and social links"
git push origin main
```

Keep `.env.local` out of Git. Vercel uses the existing Supabase URL and publishable key. No new Vercel environment variables are required.

## Validate with your Google-admin account
1. Admin → Settings: check and correct phone and address.
2. Confirm the **Google Maps** URL works, and Facebook opens `https://www.facebook.com/chapkhana`.
3. Check the timetable: Saturday to Friday, 11:59 AM–11:59 PM, from the user-supplied Maps screenshot. **Confirm current hours with restaurant owner** before publishing.
4. Test updating one day, closing one day and restoring the schedule. Test saving and refreshing the page.
5. Check homepage Find Us section, footer social links and mobile widths.
6. Test a regular customer cannot save settings, and a signed-in admin can.
7. Test menu item discount and existing checkout remain unchanged.
8. Test announcements appear immediately after save.

## Operational limitation
**Changing opening hours does not automatically disable order checkout.** The backend still uses the admin's separate `Accept online orders` switch. If staff are unavailable, manually pause orders. Google Maps opening-hours updates do not automatically sync with this app. Instagram and WhatsApp remain blank until staff supply official details.

## Testing done for this release
- Node-based catalog/admin/SQL/source regression suite: 19 passed locally.
- Store profile helper typecheck and runtime assertions passed; 24 TS/TSX files parsed without syntax errors.
- Complete `npm ci` / Vite browser build could not be verified in this environment due an npm client error fetching dependencies. Run tests and build in Codespaces. Supabase migration must still be tested against your actual database.
