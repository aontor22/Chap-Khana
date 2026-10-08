# Local test report — 9 October 2026

## Passed in this environment

- `npm run test:catalog`: **5 / 5 passed** (catalog count and IDs, categories, price typing, spot-checked photo prices, SQL safe update policy, logo asset and references).
- TypeScript compiler API syntax/transpile check: **18 TS/TSX source files parsed, 0 syntax diagnostics**.
- Logo asset verification: transparent RGBA, dimensions 2172 × 724 pixels; favicon generated.

## Blocked / not validated here

- `npm install` timed out because external npm registry access was unavailable.
- `npm run build` cannot complete without installed dependencies; it stops at missing `vite/client` type definition. This is an environment/dependency blocker, **not proof that a complete production build passes**.
- Vitest suite requiring `vitest` **not executed** for the same reason.
- Browser UI/E2E flows with a running Vite server **not executed**.
- Supabase migration is prepared but not applied to a real Supabase project; PostgreSQL DDL/RLS and Google OAuth are **not live-tested**.

## Actions for the user before deployment

```
npm ci          # use npm install if package-lock.json has not been generated
npm run test:catalog
npm test
npm run build
npm run dev
```

Verify the new header/footer logo and the mobile UI at widths 320, 375, 768, 1024, 1440. Test cart, prices, checkout, guest/user order history, session refresh, admin allowlist, and status transitions against a staging Supabase project first. Confirm and deploy the SQL migration before enabling ordering. Never publish an unverified restaurant menu as current without approval.
