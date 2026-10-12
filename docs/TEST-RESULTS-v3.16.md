# Chap Khana v3.16.0 validation status

- 70 Node source/regression tests passed (including 6 dedicated purchasing checks).
- 10 isolated purchasing calculation smoke checks passed.
- 77 TS/JS source/test files parsed/transpiled without syntax errors in the available environment.
- `npm ci --offline` could not complete because `yallist@3.1.1` was missing from the npm cache.
- Therefore complete Vitest/Vite build, real browser interaction, and live PostgreSQL transaction/RLS tests are **not yet verified**.

On Codespaces run `npm ci && npm run test:catalog && npm test && npm run build && npm audit --omit=dev`.
Then execute the staging acceptance checklist in `docs/PHASE5-SUPPLIER-PURCHASING-v3.16-BN.md`.
