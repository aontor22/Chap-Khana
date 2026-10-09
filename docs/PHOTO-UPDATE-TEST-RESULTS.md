# Food imagery v3.2 — local validation notes

## Confirmed locally

- `node --test tests/catalog.test.mjs`: **8/8 passed**.
- All 93 catalog rows use an HTTPS Unsplash `photo-*` URL; 53 distinct referenced images overall, including 40 distinct images across 56 published dishes. Similar variants share relevant imagery.
- Photo-source attribution CSV (`docs/FOOD-IMAGE-SOURCES.csv`) contains all 93 mappings.
- `05_reference_food_images.sql` applies only to `public.menu_items.image_url` values that were previously NULL or empty; it doesn't change price, active flags, menu availability, store/order state or manual owner image links.
- Global TypeScript transpilation syntax check: **21 `.ts`/`.tsx` files; zero parser/transpilation errors**.
- The transparent Chap Khana logo, favicon and brand assets were retained unchanged.

## Not verified here

- Complete `npm run build` and TS dependency resolution: npm dependencies are absent in this workspace; global `tsc` reports `TS2688 Cannot find type definition file for 'vite/client'`. Build with `npm ci` or `npm install` on Codespaces/Vercel and rerun.
- Third-party images load on end-user connections and are exact culinary matches for every menu variant. Browser/CDN fetch verification was not possible from this workspace. The frontend includes graceful error fallback.
- Staging/live Supabase migration and authenticated admin/order flows need the restaurant's credentials and a test project.

## Deployment acceptance

1. `npm install && npm run test:catalog && npm test && npm run build` succeeds.
2. Vercel frontend loads a representative selection of chicken, beef, naan, salad, drinks and coffee photos on phone and desktop; check DevTools Network for 404/CORS issues.
3. Existing owner image URLs remain unchanged after `05_reference_food_images.sql` in a staging DB.
4. Verify 56 public items and 37 admin-only drafts; prices and order state remain unchanged.
