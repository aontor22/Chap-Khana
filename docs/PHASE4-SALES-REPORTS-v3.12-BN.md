# Chap Khana v3.12.0 — Sales Analytics & Reports

## নতুন সুবিধা
Admin Dashboard → **Sales & reports**। নির্বাচিত তারিখে order count, completed/cancelled/in-progress orders, completed order value (BDT), discounts saved, delivery fees, popular dishes এবং daily/monthly breakdown দেখা যাবে। CSV export-এ customer name/phone/address বা tracking token থাকবে না।

**ব্যাখ্যা:** এটি payment-verified revenue নয়। `status = completed` order-গুলোর মোট টাকার হিসাব। Cash collected, refunds, payment reconciliation বা profit-এর হিসাব আলাদা করে রাখা হয়নি। Day grouping হলো **order created date, Asia/Dhaka**, completed-at date নয়। Order status পরে পরিবর্তন করলে পুরোনো report বদলাতে পারে।

## GitHub Codespaces-এ patch merge

1. `Chap-Khana-v3.12.0-Sales-Analytics-Patch.zip` Codespaces repo root-এ upload করো।
2. Terminal:

```bash
cd /workspaces/Chap-Khana
ls -lh Chap-Khana-v3.12.0-Sales-Analytics-Patch.zip
unzip -o Chap-Khana-v3.12.0-Sales-Analytics-Patch.zip -d /tmp/chap-v312
# Confirm path BEFORE rsync (ZIP contains Chap-Khana/)
test -f /tmp/chap-v312/Chap-Khana/package.json || exit 1
rsync -av --exclude='.git/' --exclude='node_modules/' --exclude='.env.local' /tmp/chap-v312/Chap-Khana/ ./
node -p "require('./package.json').version"
npm ci
npm run test:catalog
npm test
npm run build
npm audit --omit=dev
```

Expected version `3.12.0`. Do not run `npm audit fix --force` without assessing migration risks.

## Supabase SQL 11

When ready, **after SQL 06 (discount snapshot) and SQL 08 (security)**, run `supabase/migrations/11_staff_sales_analytics.sql` in Supabase SQL Editor. Existing data is not deleted/updated by this migration. Back up and stage-test before applying in production.

If SQL 08, 09, 10 are pending, 09/10 are optional independent realtime/image-storage features; for sales reports **06 and 08 are prerequisites**. Verify the preceding migrations as appropriate.

Check SQL permissions:

```sql
SELECT
  has_function_privilege('anon','public.staff_sales_report(date,date)','EXECUTE') AS guest_allowed,
  has_function_privilege('authenticated','public.staff_sales_report(date,date)','EXECUTE') AS signed_in_allowed;
```

Expected `false`, `true`. **Important:** `authenticated = true` does *not* mean any signed-in customer can view data: the function also checks that `auth.uid()` exists in `public.admin_users` and otherwise throws a 42501 permission error.

## Production QA

- [ ] Staff sees Reports page; ordinary customer cannot access report RPC.
- [ ] Completed order included; pending/cancelled excluded from completed value.
- [ ] Report counts include pending and cancelled placed orders.
- [ ] Discount savings reflect immutable order-item snapshot (not current menu discount).
- [ ] Orders around midnight use Asia/Dhaka date.
- [ ] Date input rejects reversed/invalid/>366-day range.
- [ ] Daily/monthly CSV downloads open and contain no customer PII.
- [ ] Google sign-in, menu, images, checkout, tracking and notifications still work.
- [ ] Real report shows understandable error until SQL 11 is run; demo works independently.

## GitHub push after tests

```bash
rm -f Chap-Khana-v3.12.0-Sales-Analytics-Patch.zip
git status --short
git add src/ tests/ supabase/migrations/11_staff_sales_analytics.sql docs/ package.json package-lock.json CHANGELOG-v3.md README.md START-HERE-BN.md
git commit -m "Add staff sales analytics and CSV reports v3.12"
git push origin main
```

## Key official docs
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase JavaScript RPC](https://supabase.com/docs/reference/javascript/rpc)
