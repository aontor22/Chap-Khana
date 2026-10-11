## v3.12.0 — Sales Analytics & Reports (2026-10-11)

- New authorized-staff-only Sales & Reports tab on desktop and mobile.
- Supabase `staff_sales_report(date,date)` aggregate RPC secured with an internal allowlist check; no customer PII in the response.
- Asia/Dhaka date presets, 366-day date cap, daily/monthly breakdown, completed-value KPIs, top dishes and discount totals.
- CSV downloads for daily, monthly and item reports; formula-injection protection.
- Demo-mode aggregate report from local synthetic orders.
- New migration `11_staff_sales_analytics.sql`; earlier database migrations remain unchanged.
- Important: Completed order value reflects orders marked completed, **not confirmed payment collection**. Reports group orders by creation date (Dhaka).

# v3 — Brand and menu catalog update

- Added the logo recreation from the supplied printed menus to the navigation, footer, admin dashboard, item placeholders and favicon.
- Imported 56 visible public menu items and 37 hidden draft entries from historical/possibly other-branch menus.
- Introduced 12 compatible menu categories (10 with public items and 2 used by historical drafts), automatically hiding empty categories from customers.
- Preserved unknown/variable prices as null, blocking add-to-cart for those items.
- Added a Supabase migration that inserts catalog entries without deleting existing orders or overwriting existing non-null item prices.
- Updated demo menu storage key to v3 so previous 6-item demo catalog cache does not mask the new menu.
- Added built-in Node.js catalog tests and CI integration.
- Documented unclear prices, owner approvals, outstanding QA steps and build blocker.

**Status:** Catalog tests and TS/TSX syntax tests passed. Full npm build, browser E2E and live Supabase migration have not been verified in this environment.


## v3.1.0
- Replaced the website brand asset with a transparent PNG wordmark based on the provided printed menu logo.
- Rebuilt transparent favicon and square brand icons from the same logo family.
- No menu or database rows were changed in this patch.


## v3.2.0 — Illustrated online menu
- Added curated third-party Unsplash reference photo links to all 93 catalog entries (56 customer-visible, 37 admin drafts).
- Added a safely repeatable Supabase **05_reference_food_images.sql** migration. Only fills empty image_url fields, protecting owner photos, prices, order state and restaurant settings.
- Added a browser-local reference-image resolver so preexisting demo menus or Supabase records without URLs still show food imagery.
- Added category-specific emoji/gradient fallback on remote image errors, instead of repeating the restaurant brand logo across all product cards.
- Added a clear illustrative-photo disclosure and a source-credit CSV in docs/.


## v3.2.1 — Test discovery and page chunking
- Restrict Vitest discovery to `.test.ts` and `.test.tsx` suites. Run the Node.js catalog suite separately via `npm run test:catalog`.
- Load secondary routes lazily to reduce initial JavaScript size and preserve functional checkout/admin components.
- No database migrations, menu data, photos, or credentials changed.
- Dependency vulnerabilities still require review using `npm audit` from the installed project.


## v3.2.2 — Test-tooling security remediation
- Updated Vitest from 3.x to 4.1.11+ to address the patched mocker advisory.
- Enforced Tinypool >=2.1.2, which contains the prototype-pollution fixes.
- Added `npm run audit:production` to distinguish deployment dependency vulnerabilities from build/test-tool alerts.
- Kept Tailwind CSS at 3.x intentionally: migration to v4 is breaking and must receive visual regression testing. The upstream `braces` advisory currently lists no patched version, so development dependency alerts may remain.
- No changes to Supabase, Google OAuth, restaurant menu data, payments, UI, or database.


## v3.3.0 — per-menu-item discounts
- Admin can set percentage or fixed-amount discounts per menu item, turn them off, and preview final price.
- Customer menu, cart, checkout and local demo totals show discounted price and savings.
- Supabase migration 06 updates server-validated checkout and stores per-item original/discounted price snapshots. Existing orders are preserved.

## v3.4.0 — Staff dashboard discovery and login routing
- Centralized Supabase staff membership lookup across the full React application; never infer staff privilege from the Google email address or OAuth profile fields.
- Added a highlighted desktop Admin shortcut, a permission-aware mobile Staff Dashboard link, and an Account page management card for approved staff.
- Google sign-in from the regular Account page routes approved staff to `/admin` after membership verification. Customer sign-ins remain on `/account`; explicit checkout/track redirect requests are respected.
- Added retry access verification for newly approved admins and transient database lookup errors, plus clearing of old dashboard data on loss of staff access.
- Kept existing RLS rules, order data, menu prices, per-item discounts, Supabase migrations, and payment settings unchanged. No SQL migration needed for this UI update.


## v3.5.0 — Restaurant profile & hours
- Added admin-editable business contact, Facebook, optional WhatsApp/Instagram, Maps, dine-in and opening hours.
- Published hours, location and social links in responsive homepage/footer.
- Added an independent public announcement banner, safe URL/phone validation, new migration 07.
- Online ordering switch remains independent of business-hours display.


## v3.6.0 — Phase 1 launch security
- Added `08_launch_security.sql` to revoke the obsolete checkout RPC, retain secure checkout v2, and restore the weekly-hours validator's execute permission for authenticated staff.
- Restored status-only order update privilege and included transactional permission assertions.
- Added database ACL regression tests, CI `npm ci`, and production dependency audit.
- No customer data, menu prices, discounts, order history or branding changed.


## v3.7.0 — Phase 2 order notifications
- Supabase Realtime `orders` inserts/updates trigger admin order refresh (requires optional SQL 09).
- Added in-app new-order alerts, unread order indicator and click-to-enable chime.
- Kept 20s polling backup; reset alerts and subscriptions on staff logout.
- Added cursor, subscription and migration safety tests.


## v3.8.0 — Advanced order management
- Added paginated, server-filtered staff order browsing (15 rows per page).
- Added separate order-code, customer-name, customer-phone search and status/date-range filters in Asia/Dhaka timezone.
- Added detailed order modal and printer-friendly kitchen ticket with original order line snapshots.
- Kept v3.7 Realtime notifications and 20-second polling fallback intact.
- No new database schema or migration required for this release.


## v3.9.0 — Admin Photo Uploads
- Authorized staff can upload JPEG/PNG/WebP photos, preview selections, replace or revert to reference pictures.
- Client processes image into optimized WebP; new Storage SQL 10 applies 3 MB limit and admin-only RLS writes/deletes.
- Uploaded photos are public-readable; sensitive files must not be uploaded.
- Replaces old managed files only after successful menu save, with best-effort cleanup. Other photo URLs never deleted.
- No order/menu schema changes; migrations 08/09 remain independent dependencies.

## v3.10.0 — Mobile, SEO and progressive menu rendering
- Customer mobile cart shortcut; progressive 12-item menu display.
- Route-specific SEO and private-route noindex headers; sitemap/robots, improved photo layout stability.
- Cache-friendly vendor splitting in Vite; preserves v3.9 admin photo management.
- No database schema changes.

## v3.11.0 — Customer confirmation and tracking experience
- Add a dedicated `/order-confirmation` page with order number, confirmed server total, fulfillment type, requested items, print/copy and direct tracking link.
- Keep only a time-limited private receipt in `sessionStorage` (24 hours, this browser tab), never store phone or delivery address with it. Route state supports storage-blocked browsers during navigation.
- Improve `/track` with pickup/delivery-specific progress, cancellation messaging, bilingual status help, foreground-only 30-second refresh and a manual refresh button.
- Set `Referrer-Policy: no-referrer` and noindex the new private confirmation route.
- No database migration; existing `place_order_v2` and `track_order` RPC contracts unchanged.

## v3.13.0 — Promotional coupons
- Added staff-only coupon campaigns, percentage/fixed offers, minimum spend, redemption limits and scheduling.
- Added server-quoted cart coupon input and transactional checkout through `place_order_v3` only when a coupon is used.
- Captures coupon discount snapshots on new orders and includes them in receipts, kitchen tickets and completed-order aggregate reports.
- Migration `12_coupon_campaigns.sql` required for live coupons. **Loyalty points remain out of scope for this phase.**

## v3.14.0 — Customer Loyalty Points
- Rewards panel in My Account shows balance, lifetime totals, and recent events.
- Admin Rewards tab configures earning rates and redemption caps (disabled by default).
- Optional authenticated checkout point redemption with PostgreSQL-computed discount and strict wallet locks.
- Database migration 13 credits signed-in customers on completed orders; refunds reserved points for cancelled orders without double-crediting retries.
- Existing item discounts, coupons, guest checkout, menu and orders remain supported. Existing orders are NOT backfilled.
