# Chap Khana v3.6.0 — Phase 1 security & launch-readiness

## Scope of this release

This release changes **database access permissions and CI checks**, not the restaurant design, Google login, menu, per-item discounts, or historical orders.

### Changes

1. **Legacy checkout bypass closed.** The original public 6-argument `place_order` RPC remained granted to guests/customers even after the v2 checkout was introduced. It bypasses v2's request-id deduplication and basic phone rate cap. Migration 08 removes client permission to call that old RPC and its private implementation. The app already calls `place_order_v2` and no frontend change is required.
2. **Admin opening-hours saves unlocked.** Grants `authenticated` permission to execute the safe, pure weekly-hours validator referenced by the `store_settings` CHECK constraint. The staff-only `store_settings` update policy is unchanged.
3. **Order updates limited to `status`.** Reapplies column-only grants to `authenticated`; admin-users RLS is still enforced separately. No one receives direct ability to edit order totals/customer data.
4. **Security assertions in the SQL transaction.** If critical grants don't match the required state, migration 08 raises an exception and rolls back.
5. **CI uses `npm ci` and runs `npm audit --omit=dev`.** Known development dependency audit warnings remain to be resolved separately; verify actual production audit outcome in Codespaces.

## Before applying

- Ensure SQL migrations `01`, `03`, `04`, `05`, `06` and `07` succeeded. Fresh installs skip the old `02` upgrade script.
- Back up the live Supabase database (or test in a staging project first).
- Do **not** run migrations using credentials in browser JavaScript, `VITE_` variables, or public repositories.
- No production owner email, Google secret, service-role key, database password, or auth token should be placed in this ZIP or committed to Git.

## Step 1 — Supabase migration

Open Supabase Dashboard → SQL Editor → New query. Copy the **entire** contents of:

`supabase/migrations/08_launch_security.sql`

Click **Run**. The output should be `Success. No rows returned`. If the transaction raises an error, stop and do not deploy until the error is resolved.

A previous manual grant of `private.is_valid_weekly_hours(jsonb)` is safe: the new grant is idempotent.

## Step 2 — Verify permissions (read-only SQL)

Run this SQL separately in Supabase SQL Editor:

```sql
SELECT
  has_function_privilege('anon', 'public.place_order(text,text,text,text,text,jsonb)', 'EXECUTE') AS legacy_guest_allowed,
  has_function_privilege('authenticated', 'public.place_order(text,text,text,text,text,jsonb)', 'EXECUTE') AS legacy_customer_allowed,
  has_function_privilege('anon', 'public.place_order_v2(text,text,text,text,text,jsonb,uuid)', 'EXECUTE') AS v2_guest_allowed,
  has_function_privilege('authenticated', 'private.is_valid_weekly_hours(jsonb)', 'EXECUTE') AS staff_hours_validator_allowed,
  has_column_privilege('authenticated', 'public.orders', 'total', 'UPDATE') AS order_total_update_allowed,
  has_column_privilege('authenticated', 'public.orders', 'status', 'UPDATE') AS order_status_update_allowed;
```

Expected values, in order: **false, false, true, true, false, true**.

Also check:

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('orders','order_items','admin_users','menu_items','store_settings');
```

Every returned `relrowsecurity` should be `true`. These read-only queries verify **permissions and RLS configuration**, not full live user-flow behavior.

## Step 3 — Test against a staging Supabase instance

1. As an admin, edit and save hours; refresh and confirm the new values persist. As an ordinary Google user, a direct `store_settings` update must fail.
2. As a customer/guest, call `place_order` (legacy RPC) and confirm permission is denied; `place_order_v2` must still accept properly validated requests when ordering is enabled.
3. Try the same `p_request_id` twice; verify it does not create two orders. A new UUID should create a new order only when the existing order rate limit allows it.
4. As a non-admin customer, a direct `orders` status update must be denied. As an authorized admin, a valid status transition should succeed and create an audit event; edits to `total` or `customer_phone` must be denied.
5. Review a customer account: only their own orders should be visible; another customer's order details must remain unavailable. Guest tracking should return status, totals and reference, without personal addresses or phone numbers.
6. Keep `accepting_orders=false` while testing pricing, permissions and discounts, except when carrying out a controlled checkout test.

## Step 4 — Codespaces commands

After you merge the updated ZIP source into the existing repo:

```bash
cd /workspaces/Chap-Khana
npm ci
npm run test:catalog
npm test
npm run build
npm audit --omit=dev
npm audit
```

**If any test or production audit fails, do not deploy.** `npm audit` may still report development-tool issues caused by Tailwind 3; those are not automatically fixed by migration 08. Do not run `npm audit fix --force` blindly.

## Remaining tasks — not part of Phase 1

- Add Turnstile or server-side edge/IP throttling for public order submissions. Rate limiting by phone alone is insufficient against automated abuse.
- Verify privacy policy and retention/deletion procedures for names, phones, addresses and order history.
- Run real browser E2E tests and mobile checks, plus load tests before a commercial launch.
- Confirm food photos, menu prices, phone, hours and restaurant owner's authorization.

### Official references

- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: Database functions](https://supabase.com/docs/guides/database/functions)
- [PostgreSQL: GRANT](https://www.postgresql.org/docs/current/sql-grant.html)
- [npm: npm audit](https://docs.npmjs.com/cli/v10/commands/npm-audit)
