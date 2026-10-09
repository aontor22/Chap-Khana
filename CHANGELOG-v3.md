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
