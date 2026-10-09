# Chap Khana security-tooling update (v3.2.2)

## Changes
- `vitest`: upgraded the manifest from 3.x to `^4.1.11` following GitHub advisory GHSA-82fw-gwwq-j7x9.
- `tinypool`: `overrides` now requires `^2.1.2` for patched versions per GHSA-85c8-ppgw-ccpr.
- No other packages, code, schema, or UI were migrated.

## Remaining alerts
Tailwind v3 depends on tooling involving `braces` (GHSA-vfj7-8cjw-p6xm). The upstream advisory currently lists **no patched braces release**, while `npm audit fix --force` suggests a breaking Tailwind 4 migration. We intentionally have NOT applied that migration without a complete CSS visual regression pass. Thus `npm audit` may still show high/moderate alerts affecting development dependencies.

## Run in Codespaces

```bash
npm install
npm ls vitest @vitest/mocker tinypool
npm run test:catalog
npm test
npm run build
npm audit --omit=dev
npm audit
```

If `npm audit --omit=dev` reports 0 vulnerabilities, npm has found no known vulnerabilities in *production* dependencies at the time of the check, but that does not prove the deployed app is secure. Admin role verification, Supabase RLS, checkout RPC permissions, staging orders, and rate limits require separate security tests.

## What NOT to do
- Do not run `npm audit fix --force` without planning a Tailwind 4 CSS migration.
- Do not delete `package-lock.json` just to hide npm audit errors.
- Do not mark the app as vulnerability-free merely because production auditing is clean.

## Sources
- https://github.com/advisories/GHSA-82fw-gwwq-j7x9
- https://github.com/advisories/GHSA-85c8-ppgw-ccpr
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://tailwindcss.com/docs/upgrade-guide
