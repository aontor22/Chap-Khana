# Chap Khana 3.8.0 — Local verification

Checked on 2026-10-11 in the packaging environment.

- `npm run test:catalog`: **31/31 passed**, including 4 new order-management source checks.
- Independent runtime verification of the `orderManagement.ts` helpers: **7 checks passed** (Dhaka UTC boundaries, invalid dates, search sanitization, order filtering and pagination).
- TypeScript/TSX source parsing (TypeScript transpileModule): **34 files, zero syntax errors**.
- Full `npm ci`, `npm test`, `npm run build` **not executed successfully**. The dependency cache lacks `yallist@3.1.1` and network install failed with npm's `Exit handler never called` message. Do not infer typecheck or production-build success from syntax parsing.
- Live Supabase staff/RLS and kitchen printer testing **not performed**; test with staging data as described in the Bengali guide.
- Package preserves existing migrations 01–09 and does not add a migration 10.
