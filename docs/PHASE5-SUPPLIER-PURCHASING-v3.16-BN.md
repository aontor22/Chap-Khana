# Chap Khana v3.16.0 — Supplier & Purchase Management

## What is included

- Admin-only supplier directory with name, phone, email, notes and active status.
- Purchase order drafts with 1–50 unique ingredients, required stock-unit quantities and BDT cost estimates.
- Purchase workflow: `draft → ordered → partially_received → received`; cancel is allowed only before the first receipt.
- Partial/full goods receiving directly into the existing `inventory_ingredients.on_hand` stock balance, and an entry in `inventory_movements` for every received ingredient.
- Idempotent receiving requests keyed by a UUID; replay of an identical request cannot increase stock twice.
- Immutable goods-receipt line quantities and unit-cost snapshots, recent receipt history and supplier-only RLS.
- No modifications to checkout, loyalty, coupons, customer data or menu prices.

## Deployment and SQL order

1. Verify v3.15.0, `14_inventory_management.sql`, and earlier migrations are applied successfully in **staging**.
2. Run only `supabase/migrations/15_supplier_purchasing.sql` (as a single query) in staging. It is wrapped in `BEGIN`/`COMMIT`.
3. In Supabase SQL Editor, confirm presence of the five new tables and three RPC functions:

```sql
select to_regclass('public.purchase_suppliers') is not null as suppliers_ready,
       to_regclass('public.purchase_orders') is not null as orders_ready,
       to_regclass('public.purchase_receipts') is not null as receipts_ready,
       to_regprocedure('public.purchase_receive(uuid,uuid,jsonb)') is not null as receiving_ready;
```

4. Confirm an anonymous user **cannot** select supplier data or call purchasing RPCs; confirm authorized staff can read and create purchases.
5. Create a supplier, then a draft PO for an existing active ingredient. `Mark ordered`. Receive a smaller amount first and verify `partially_received`.
6. Verify `inventory_ingredients.on_hand` and the `inventory_movements` entry increased by exactly the quantity received. Retry the **same request UUID with the same payload**: stock must not increase a second time. A changed payload with the same UUID must fail.
7. Receive the outstanding quantity. Verify `received`, correct receipt history, and no excessive receiving is possible. A received/partially received PO cannot be cancelled by this UI.
8. Repeat with `piece` units (fractions must fail); try an unauthorized customer session (must fail), and exercise concurrent receiving in staging to check the purchase-order lock.
9. Only when these checks are completed, apply SQL 15 to production and deploy code. Real inventory tracking must already be safely configured in v3.15.

**Warning:** SQL Editor normally runs as an elevated database role. A successful call there does **not** verify RLS for browser users. Test real admin and customer sessions in staging.

## Codespaces

```bash
cd /workspaces/Chap-Khana
npm ci
npm run test:catalog
npm test
npm run build
npm audit --omit=dev
```

## How staff use it

Admin Dashboard → **Purchasing** → Suppliers → Add supplier → Purchase orders → Create draft → Mark ordered → Receive goods. For manual restock or waste corrections that do **not** correspond to supplier receipts, keep using **Inventory → Adjust stock**.

## Scope and limitations

- Costs are **estimated procurement value**, not evidence of a payment. No supplier invoices, payment ledger, purchase returns or tax accounting is included.
- Display is limited to the most recent 50 POs and 50 receipts; large-scale purchasing needs pagination and period-based reporting.
- Existing inventory is not modified simply by running the migration. Stock increases only on successful receipt of a PO.
- Demo data stays in local browser storage and is never a real inventory or purchase transaction.
- SQL migration and full integration must be validated in staging before live usage.
