# Chap Khana v3.17 — Supplier Returns & Payments

This release builds on v3.16 and requires **SQL 15** before SQL 16. Existing purchasing screens remain usable if SQL 16 is pending.

## Updated features
- Admin → Purchasing → **Returns & payments**: choose a purchase order and its goods receipt; return eligible ingredient quantities with a reason.
- All returns refer to an actual **receipt line**, not a planned purchase line; original receipt costs determine the supplier credit.
- Stock is deducted only when enough ingredient stock remains available, and every return creates an inventory movement.
- Record supplier payments (BDT; cash, bank, bKash, Nagad, other), payment date, reference and notes. This is bookkeeping **only**; there is **no money transfer**.
- Track received value, returned value, recorded payments, **outstanding payable**, and separately **supplier credit** (for example when goods are returned after you have already paid).
- Database-level request IDs prevent duplicate payment or returns after network retries; financial rows are immutable to ordinary clients.

## Codespaces — Patch update
Upload `Chap-Khana-v3.17.0-Supplier-Finance-Patch.zip` into `/workspaces/Chap-Khana`:

```bash
cd /workspaces/Chap-Khana
ls -lh Chap-Khana-v3.17.0-Supplier-Finance-Patch.zip
unzip -o Chap-Khana-v3.17.0-Supplier-Finance-Patch.zip -d /tmp/chap-v317
test -f /tmp/chap-v317/Chap-Khana/package.json && \
rsync -av --exclude='.git/' --exclude='node_modules/' --exclude='dist/' --exclude='.env.local' \
  /tmp/chap-v317/Chap-Khana/ ./
node -p "require('./package.json').version" # expected 3.17.0
npm ci
npm run test:catalog
npm test
npm run build
npm audit --omit=dev
```

When all checks succeed, remove uploaded ZIP before pushing:

```bash
rm -f Chap-Khana-v3.17.0-Supplier-Finance-Patch.zip
git status --short
git add src/ tests/ supabase/ docs/ package.json package-lock.json CHANGELOG-v3.md README.md START-HERE-BN.md
git commit -m 'Add supplier returns and payments v3.17'
git push origin main
```

## SQL migration 16
1. Take a database backup and preferably test on a staging Supabase project.
2. Ensure `14_inventory_management.sql` and `15_supplier_purchasing.sql` were applied successfully.
3. SQL Editor → New query → execute **all of** `supabase/migrations/16_purchase_returns_payments.sql` as one script.
4. Run this read-only verification:

```sql
SELECT
 to_regclass('public.purchase_returns') IS NOT NULL AS returns_ready,
 to_regclass('public.purchase_payments') IS NOT NULL AS payments_ready,
 to_regprocedure('public.purchase_financial_summary(uuid[])') IS NOT NULL AS summary_ready,
 to_regprocedure('public.purchase_return_goods(uuid,uuid,text,jsonb)') IS NOT NULL AS return_rpc_ready,
 to_regprocedure('public.purchase_record_payment(uuid,uuid,numeric,text,text,text,date)') IS NOT NULL AS payment_rpc_ready;
```

All five should be `true`; this verifies object existence, **not** transactional correctness.

## Required staging QA
1. Create an ingredient with 10 kg on hand; create a purchase order for 5 kg @ ৳200/kg, mark ordered and receive 5 kg. The ingredient should now have 15 kg and received purchase value ৳1,000.
2. Return 2 kg **against that specific receipt**. Ingredient stock should become 13 kg; a negative inventory movement must be added. Supplier returns should show a ৳400 credit; outstanding payable should be ৳600.
3. Record a ৳250 cash payment. Outstanding should be ৳350, paid should be ৳250. No real payment occurs from the app.
4. Retry *the same* request ID in the Supabase RPC (staging) and check no second deduction/payment. Try a different payload with the same request ID; it must fail.
5. Try to return more than the receipt remaining and return an ingredient amount larger than current stock; both must fail with no partial changes.
6. With a separate non-admin Google account, try RPC writes and table reads; they must be denied.
7. For a paid-in-full receipt, return goods and confirm supplier credit becomes positive **without** reporting it as cash refunded.
8. Ensure existing menu, discounts, coupons, loyalty, order tracking and v3.16 receiving still function.

**Accounting limitations:** The system records payments already made and purchase return credits; it does not execute payouts, reconcile a bank statement, process supplier refunds/settle credit, handle taxes/credit notes, or replace formal accounting software. Recent activity lists are limited, while the balance RPC calculates aggregate totals from full stored history for the selected purchase orders. Refunds due from suppliers must be settled externally.

**Rollout:** UI may be deployed before SQL 16; finance panel will display an explicit pending-migration message. Do not record live payments/returns until migration and staging tests pass.
