# Chap Khana — React + TypeScript restaurant ordering platform

**Version:** 3.2.0 (brand + menu reference photography) · **Framework:** React 19 / Vite 7 / TypeScript strict / Tailwind 3 · **Backend:** Supabase PostgreSQL/Auth/RPC

This repository is a component-based rebuild of the prior vanilla-JS Chap Khana showcase/ordering prototype. Includes bilingual storefront, live-priced menu, local demo mode, cart, pickup/delivery checkout, idempotent PostgreSQL RPC, order tracking, Google login, account order history, staff dashboard, menu editor and settings.

**Owner approval is required.** Restaurant contact and every photographed menu price require owner confirmation before live orders. The new logo is a visual recreation of the photos, not an original vector logo. No payment gateway has been configured.

## Quick start

```bash
node -v                    # v20.19+ (Node 22 LTS recommended)
npm install
cp .env.example .env.local # fill in public URL and publishable key for live mode
npm run dev
npm run build
npm run test:catalog
npm run test
```

If `.env.local` is missing, the storefront operates in **DEMO MODE** with sample prices, browser-local fake orders and a demo staff panel. **No live order is created in this mode.** With `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set, DEMO MODE is completely disabled; real menu prices and settings come from Supabase.

## Architecture

```
src/
  components/      Shared layout, food product cards
  context/         Supabase Auth session, menu, cart and locale
  data/            Typed Supabase data-access layer, local demo data and text
  lib/             Environment configuration, SDK and validation
  pages/           Home, cart, checkout, tracking, account, staff dashboard
  styles/          Tailwind theme & responsive component styling
supabase/
  01_fresh_schema.sql                 Run only on an EMPTY database
  02_existing_google_upgrade.sql     Run only for a pre-Google legacy database
  migrations/03_production_hardening.sql  Run for both fresh and upgraded DBs
  migrations/04_brand_menu_catalog.sql  Run AFTER 03 to import 56 public dishes + 37 hidden drafts
  migrations/05_reference_food_images.sql Run AFTER 04 to add photos ONLY to empty image_url fields
```

Key security boundaries:

- User-facing prices and order totals are calculated from PostgreSQL, never trusted from the cart.
- Staff-only write privileges are enforced by Postgres RLS with a server-side membership table. Google sign-in **does not** mean staff access.
- Customer order history is restricted to `customer_user_id = auth.uid()`; guest order tracking requires an unguessable UUID.
- The hardening migration limits direct staff writes on orders to the `status` column, enforces status transitions, and records an append-only audit trail.
- Checkout uses **`place_order_v2`** with a UUID idempotency key to safely retry after an uncertain network response. The database retains the older six-argument RPC for backward compatibility with older deployments.
- The migration adds a basic per-phone order-frequency check. **Before live launch, add edge/IP rate limiting + CAPTCHA verification, monitoring, legal notices and backups.** This safeguard alone is NOT commercial-grade abuse prevention.
- All Auth session handling uses `@supabase/supabase-js` (PKCE, refresh token rotation). Secrets never enter the browser.

## Database installation

### New Supabase project

1. Run `supabase/01_fresh_schema.sql` in Supabase SQL Editor.
2. Run `supabase/migrations/03_production_hardening.sql`.
3. Run `supabase/migrations/04_brand_menu_catalog.sql`, then `supabase/migrations/05_reference_food_images.sql`.
4. Leave `accepting_orders=false` until owner-approved menus and anti-abuse measures are in place. Nine catalog entries have unconfirmed prices.

### Existing Chap Khana database

1. **Back up the database first** and test on a staging clone.
2. If your old database predates Google customer accounts, run `supabase/02_existing_google_upgrade.sql`; otherwise skip it.
3. Run `supabase/migrations/03_production_hardening.sql`. It does not reset menu or existing orders.
4. Run `04_brand_menu_catalog.sql` if not already applied; run `05_reference_food_images.sql` to fill only blank image URLs.
5. Verify `public.place_order_v2` appears in Supabase's database functions.

### Assign real admin role

Sign in once with Google using the intended owner's email. In Supabase **SQL Editor**, run:

```sql
insert into public.admin_users(user_id)
select id from auth.users where lower(email)=lower('OWNER@EXAMPLE.COM')
on conflict(user_id) do nothing;
```

Do not execute this SQL from the browser or create public role-assignment APIs.

## Google OAuth setup

1. Google Cloud Console → Google Auth Platform → create OAuth **Web application** credentials.
2. Authorized redirect URI **must be** `https://YOUR_PROJECT.supabase.co/auth/v1/callback`.
3. In Supabase → Authentication → Providers → Google: enable Google and enter **Client ID and Client Secret there only**.
4. Supabase → Authentication → URL Configuration: Site URL = your Vercel production URL, redirect allowlist = `https://YOUR_DOMAIN/auth/callback` plus local `http://localhost:5173/auth/callback` when developing.
5. Google authorized JavaScript origins: your HTTPS site origin and localhost while developing, if required by your OAuth client.
6. Supabase's PKCE callback at `/auth/callback` uses the SDK to restore the session. Never place Client Secret in `VITE_*` variables.

## Deploy

### Vercel (recommended)
- Push the **contents** of this folder to GitHub.
- Vercel → New Project → import repository.
- Framework: **Vite**, Root: project root, Build command `npm run build`, Output directory `dist`.
- Add environment variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` for Production and Preview as applicable.
- Deploy and configure the EXACT deployed URL in Supabase Auth allowlists.
- `vercel.json` includes SPA rewrites for React Router and basic security headers.

### Render (optional alternative, not required as a backend)
- New → **Static Site**, connect GitHub repository.
- Build: `npm install && npm run build`; Publish directory: `dist`.
- Add identical `VITE_...` environment variables at build time.
- Render Static Site URL must be included in Supabase Auth redirect allowlist to use Google login there.
- Since Supabase serves the database/backend, a separate Render **Web Service** is not needed. A future Express API would require its own secure service.

## Launch checklist

- [ ] Restaurant owner approved public website, actual address, contact, images, menu and prices.
- [ ] Fresh/staging Supabase migration validated (schema + migration 03).
- [ ] Menu products have real integer BDT prices; item photos use owner-approved image assets.
- [ ] Staff memberships tested: non-staff cannot read admin orders or edit settings.
- [ ] SQL-level acceptance: RPC validates item IDs, duplicate lines, qty, store closed, inactive, unpriced item, total tampering.
- [ ] Order status transition and audit history checked against real database.
- [ ] Google OAuth callback, 7-day+ browser session continuity under provider policy, and account order history tested end-to-end.
- [ ] Edge/IP CAPTCHA and abuse prevention configured before `accepting_orders=true`.
- [ ] Restaurant's cancellation/refund terms, privacy policy, delivery area, and legal compliance reviewed.
- [ ] Email/SMS alerts and staff operational processes arranged; until then, staff dashboard polls every 20 seconds.
- [ ] Backups, error monitoring, analytics (with consent), and alerts established.

## Known boundaries

- Payment is **cash on pickup/delivery only**; no bKash/Nagad/card/online payment capture and no webhook reconciliation.
- Inventory deduction, taxes, multi-location operations, dispatch and automatic notifications are not implemented.
- Database policy integration tests need access to a real Supabase instance; no remote database credentials are included.
- React production build and Vitest require npm packages; no compiled `dist` is committed to this source ZIP.

**Documentation:** [React](https://react.dev/learn) · [Vite](https://vite.dev/guide/) · [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google) · [Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite) · [Unsplash license](https://unsplash.com/license).

## Brand and photographed menu catalog (v3.0)

- Uses `public/brand/chap-khana-logo.png` across header, footer, admin and branded dish placeholders; `public/favicon.png` is an emblem crop. This logo is a **generated recreation**, so get the official source asset from the owner for an exact brand match.
- `src/data/menu-catalog.json` includes **93 records: 56 public, 37 admin-only drafts** from potentially older/other-branch printed menus. Nine public prices are unknown and intentionally not orderable. The public prices are transcribed from photos, **not verified**.
- Run `supabase/migrations/04_brand_menu_catalog.sql` after the prior production hardening migration. It leaves existing priced menu rows and customer orders alone. Existing manually edited prices can differ from source and should be rechecked in the admin UI.
- More detail: `docs/MENU-AND-BRAND-REVIEW.md` and `docs/TEST-RESULTS.md`.
- Run `npm run test:catalog` to test the JSON data and SQL seed without installing third-party dependencies. The standard `npm test` still runs the existing Vitest suite after installing npm dependencies.

Official references: [React](https://react.dev/learn), [Vite](https://vite.dev/guide/), [Supabase Auth](https://supabase.com/docs/guides/auth), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).


## Online menu reference photos (v3.2)

All **93 catalog entries** (56 visible + 37 admin drafts) have illustrative Unsplash reference photo URLs with per-item photo source-page links in `docs/FOOD-IMAGE-SOURCES.csv`. Variants sometimes reuse visually appropriate reference photos. These images **are not photos of Chap Khana's actual dishes**. The React component gives priority to an owner's `menu_items.image_url` and falls back to the catalog image only if it is empty; failed remote images display category-specific food icon/gradient instead of the repeated brand logo.

**Apply images to the real Supabase DB:** After `04_brand_menu_catalog.sql`, paste and run `supabase/migrations/05_reference_food_images.sql` in SQL Editor. Re-running is safe; custom images, pricing, availability and orders are untouched. You still must deploy the React source to Vercel. The photos link to a third-party CDN; test actual loading on mobile and desktop, replace with original restaurant photography when available, and observe the photographer source links and [Unsplash License](https://unsplash.com/license).


### Per-item discounts (v3.3)
Run `supabase/migrations/06_item_discounts.sql` **after** the earlier fresh schema/hardening/catalog scripts and before deploying this frontend. Then Admin > Menu > Edit > Item discount to set % or ৳ off. See `docs/ITEM-DISCOUNTS-BN.md`. Discounts are computed in the database, not trusted from the browser.

### v3.4 — Direct admin navigation
Approved Supabase staff now have a responsive Admin shortcut in the header, mobile menu and Account page. A normal Google login routes authorized staff directly to `/admin`; ordinary customers remain on `/account`. Existing `admin_users` RLS is authoritative. No additional SQL migration is required. See [`docs/ADMIN-NAVIGATION-v3.4-BN.md`](docs/ADMIN-NAVIGATION-v3.4-BN.md) for troubleshooting, testing and deployment.


## Restaurant profile / opening hours (v3.5)

After migration `supabase/migrations/07_restaurant_profile_hours.sql`, Admin → Settings supports per-day opening hours (Asia/Dhaka), phone, address, optional WhatsApp and Instagram, Facebook, Maps, dine-in, announcements, pickup/delivery and fee. Information appears in homepage and footer. Schedule visibility does not automatically determine the backend `accepting_orders` flag; explicitly pause orders when the business is unavailable. No existing order rows or discounts are modified.


### v3.6 Phase 1 security update
If you already applied migrations 01–07, run `supabase/migrations/08_launch_security.sql` in Supabase SQL Editor **before** deploying. This prevents the legacy RPC from bypassing v2 checkout protections and fixes admin weekly-hours validation permissions. Refer to [Phase 1 security guide](docs/SECURITY-PHASE1-v3.6-BN.md) for read-only verification SQL and staging tests. The codebase is not independently tested against your live Supabase project.
