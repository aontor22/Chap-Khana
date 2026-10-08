# QA and security acceptance checklist

## Automatic checks (after `npm install`)

```bash
npm run typecheck
npm run build
npm test
```

GitHub Actions also runs these checks on commits/PRs (build and unit tests).

## Manual browser checks

1. Demo (without env vars): responsive desktop/mobile 320–1440px; language switch; search & category; cart add/remove and refresh; checkout -> explicitly fake receipt; same-browser token tracking; demo staff edits.
2. Live (with env vars): menu and settings must come from Supabase; demo prices/order records must NEVER appear. A NULL price cannot be added.
3. Disable `accepting_orders` in Supabase and check that checkout cannot submit.
4. Set verified prices then submit a cash pickup order and a delivery order, verify totals in SQL.
5. Sign in as a Google customer; confirm own order history only, not other customers'.
6. Sign in as non-staff: `/admin` denied, direct PostgREST admin updates denied.
7. Add owner user to `admin_users` with SQL; can edit dishes, update settings and process orders.
8. Only permitted status transitions work. Verify `order_status_events` rows appear after a status update.
9. Re-submit the same `p_request_id` twice: expect the same code and tracking token; different IDs create separate orders (subject to rate limit).
10. Tamper with client cart price/total values: database ignores them; always calculates from `menu_items`.
11. Track with fake token: no personal details. Public `orders` select denied to anonymous visitor.
12. Retry checkout after simulated network interruption without changing request ID; verify exactly one order.

## Database assertions in Supabase SQL Editor

```sql
-- Check production hardening installed
select column_name from information_schema.columns
where table_schema='public' and table_name='orders'
  and column_name in ('updated_at','client_request_id');

-- Orders must have RLS on
select relname,relrowsecurity from pg_class
where relname in ('orders','order_items','menu_items','admin_users','store_settings','order_status_events');

-- Check staff order update is only allowed on status, not totals/customer details
select grantee,privilege_type,column_name
from information_schema.column_privileges
where table_schema='public' and table_name='orders'
  and grantee='authenticated' and privilege_type='UPDATE';

-- Check safe launch defaults
select accepting_orders,pickup_enabled,delivery_enabled,delivery_fee
from public.store_settings where id=1;
```

**Do not turn public ordering on before** rate-limit/Turnstile edge verification, monitoring and ownership/price confirmation. Database integration checks cannot be run against this ZIP alone; use a staging Supabase project.
