# Chap Khana v3.15.0 — Validation report

## Verified in build workspace
- Baseline: extracted `Chap-Khana-v3.14.0-Loyalty-Rewards-Full.zip`.
- `npm run test:catalog` → 64/64 passing Node.js tests (including inventory security/source regression).
- Inventory runtime calculation smoke checks → 4/4 passing (metric precision, serving integer quantities, recipe validation, low-stock rules).
- TypeScript transpilation/parser check → 73 source/test TS/TSX/JS files, 0 syntax diagnostics.
- SQL migration source inspected for checked atomic decrements, cancellation snapshot restoration, staff RLS policies and public availability function.
- No existing checkout RPC, coupon or loyalty pricing logic modified.

## Not verified in this workspace
- `npm ci` / full Vitest / TypeScript typecheck / full Vite build. Offline cache lacks `yallist@3.1.1` and the npm registry isn't available here.
- Executing SQL 14 in an actual PostgreSQL/Supabase database (no PostgreSQL server installed here).
- Real browser uploads, concurrent ordering or live RLS/permission-denial tests.

## Required before production enabling
1. Apply SQL 14 on a Supabase **staging** project with migrations 01–13 present.
2. Run `npm ci && npm run test:catalog && npm test && npm run build` in Codespaces.
3. Follow the complete stock/cancellation, coupon/loyalty, concurrent-order, RLS denial QA in `docs/PHASE5-INVENTORY-v3.15-BN.md`.
4. Keep `inventory_settings.enabled=false` in production until all checks pass and real item/recipe balances have been entered.

No seeded ingredient quantities are included; intentionally prevents inventing restaurant stock.
