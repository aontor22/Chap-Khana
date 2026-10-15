# Chap Khana v3.19.0 — Kitchen Display System (KDS)

## কী যুক্ত হয়েছে
- Admin → **Kitchen display** (desktop + mobile): চারটি Kanban-style column: New, Confirmed, Preparing, Ready / delivery.
- পূর্ণ কিচেন অর্ডার আইটেম, quantity ও special instructions; customer phone/address অযথা KDS query-তে আনা হয় না।
- Oldest orders first, elapsed time since *order placed*; >=15 minutes amber and >=30 minutes red. এগুলো configurable preparation ETA নয়।
- 12-second visible-tab polling, manual refresh, 100 oldest active orders limit. New order sound/notifications আগের admin mechanism-এর অধীনে থাকবে।
- Staff action: Confirm → Start cooking → Mark ready → Hand over / Complete. Cancellation বিশেষ ক্ষেত্রে **Orders** tab থেকে করতে হবে।
- Existing `public.order_status_events` history read; migration 03 ইতোমধ্যেই সব status updates audit করে। কোনো দ্বিতীয় ledger বা trigger নেই।
- SQL 18-এর `kitchen_advance_order` latest status lock করে যাচাই করে। Concurrent admin updates হলে stale screen reject করে এবং refresh হয়। Existing stock, rewards and order-status triggers আগের মতোই কাজ করে।

## Installation (Codespaces)
ZIP-টি `/workspaces/Chap-Khana`-এ upload করো:

```bash
cd /workspaces/Chap-Khana
unzip -o Chap-Khana-v3.19.0-Kitchen-Display-Patch.zip -d /tmp/chap-v319
test -f /tmp/chap-v319/Chap-Khana/package.json && rsync -av --exclude='.git/' --exclude='node_modules/' --exclude='.env.local' /tmp/chap-v319/Chap-Khana/ ./
node -p "require('./package.json').version"
npm ci
npm run test:catalog
npm test
npm run build
npm audit --omit=dev
```

Expected version `3.19.0`.

## Supabase migration
1. Backup + staging first. SQL 01–17 must already be applied correctly (migration 03 status audit and validators in particular).
2. In Supabase SQL Editor run **`supabase/migrations/18_kitchen_display_workflow.sql`**.
3. Verify RPC and existing status log:

```sql
SELECT
 to_regprocedure('public.kitchen_advance_order(uuid,text,text)') IS NOT NULL AS kitchen_rpc_ready,
 to_regclass('public.order_status_events') IS NOT NULL AS existing_status_audit_ready,
 has_function_privilege('anon','public.kitchen_advance_order(uuid,text,text)','EXECUTE') AS guest_can_advance;
```

Expected: `true`, `true`, `false`. This is a schema check only; it does not verify live transactions.

## Staging acceptance tests — must complete before production
1. Create controlled pickup order. Verify `pending` card has correct item/quantity and notes. Progress pending→confirmed→preparing→ready→completed. Verify customer tracking follows changes.
2. Create delivery order. From ready, next step must be **out_for_delivery**, then completed.
3. Open the same active order in two staff sessions. Advance once in A, then click stale action in B. B must get conflict error and refresh, not advance to a further status.
4. Check `order_status_events`: exactly one new audit entry per status transition. Verify staff-only visibility and that anonymous API cannot execute `kitchen_advance_order`.
5. Cancel a test order using Order Management. The KDS should remove it on refresh. Verify all inventory and loyalty cancellation hooks still behave as before.
6. On mobile, verify cards and button size; with 100+ active orders, KDS warns about the cap.

This release does **not** implement actual cook-time predictions, separate kitchen employee roles, payments or automatic printing. Order Management retains print-kitchen-ticket functionality. Use a current database backup before production changes.

## Local verification performed during packaging
Node source tests, TS syntax checks and kitchen calculation smoke tests. **Full npm typecheck/build, Vitest and live SQL transactions require Codespaces/staging** if dependencies or PostgreSQL are unavailable in packaging environment.
