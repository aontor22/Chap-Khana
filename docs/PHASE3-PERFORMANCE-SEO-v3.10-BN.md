# Chap Khana v3.10 — Mobile UX + Performance + SEO

## What changed
- Initial menu renders 12 items, with a Load More button. Search and categories still filter the **full** menu in memory.
- Mobile cart shortcut appears on `/` and `/menu` only when cart has items; no checkout or database logic changed.
- Photos have intrinsic dimensions, lazy loading and descriptive alt text. Hero photo stays high-priority for desktop.
- Page titles, descriptions, canonical and robots tags update when React routes change.
- `/admin`, `/account`, `/cart`, `/checkout`, `/track`, `/auth/callback` have HTTP `X-Robots-Tag` noindex headers on Vercel.
- Canonical URLs default to `https://chap-khana.vercel.app`, with optional `VITE_PUBLIC_SITE_URL`. Preview deployments get a client-side noindex hint. Static `robots.txt` and `sitemap.xml` use `https://chap-khana.vercel.app`; update **both files and OG image URLs** if you change the canonical production domain.
- `/menu` is a duplicate view of the home page, so canonical points to `/`.
- Vite manualChunks splits React/Router and Supabase vendors into separate cacheable bundles; evaluate actual size on Codespaces.

## Important limitations
- This is a **client-rendered SPA**; metadata changes are client-side. If you need reliable previews or indexability for each dish, migrate to prerendering/SSR and use per-page OG metadata server-side.
- Prices and illustrative photos still need restaurant owner review. Do not imply sample images are real restaurant photos.
- No Supabase SQL migration in this release. SQL `08`–`10` may still be pending for earlier features.
- No live Supabase/Auth/checkout access was available in this build environment. Test those workflows in staging.

## Codespaces tests
```bash
npm ci
npm run test:catalog
npm test
npm run build
npm run audit:production
```

## Manual QA
1. On narrow phone (<768px), add a dish: cart bar appears with correct quantity/price; clear cart: bar disappears.
2. Change category and search: first 12 matching dishes show, Load More reveals more, filters reset pagination.
3. Navigate to Cart/Checkout/Track/Admin and verify mobile cart bar does not obscure forms.
4. Visit `/robots.txt` and `/sitemap.xml`: they should return text/XML, not index.html.
5. `curl -I https://chap-khana.vercel.app/admin` includes `X-Robots-Tag: noindex...` after deploy.
6. DevTools Network: verify icons, food images, and cacheable hashed JS chunks are served correctly.
7. Test sign-in, order creation, track token privacy, admin and upload after running required SQL migrations.
