# v3.7 Verification Notes

- Existing and new Node regression tests: 27/27 passed locally.
- TypeScript/TSX syntax transpilation: 31 files, 0 syntax diagnostics.
- New pure alert-cursor tests are bundled under `tests/orderNotifications.test.ts` for the Vitest suite in Codespaces.
- Full `npm test`, `npm run typecheck`, and `npm run build` could not be executed locally: npm offline cache lacks dependency artifacts. Run these in Codespaces before pushing.
- Realtime event delivery and live database permissions were not tested. SQL 09 is optional until enabling low-latency notifications; SQL 08 remains a required security step before accepting real orders.
