# Chap Khana v3.8.0 — Advanced Order Management

## What changed
- Admin > Orders now fetches paginated order lists from Supabase, not merely the latest 100.
- Search by **Order code**, **Customer name**, or **Phone**. Search fields are intentionally separated to avoid unsafe raw PostgREST OR filters.
- Filter by status and inclusive restaurant-local (Asia/Dhaka) date range.
- 15 orders per page, with a total count from Supabase.
- **View details / print** loads one order and all its `order_items` in a separate staff-only query.
- **Print kitchen ticket** opens the standard browser print dialog and prints a clean ticket for the selected order. It is labelled staff copy / not tax invoice.
- v3.7 Realtime new-order notifications and the 20-second fallback remain in place.

## Database SQL
**No new SQL migration for v3.8.0.** The existing `orders` and `order_items` RLS / permissions are used. Finish pending `08_launch_security.sql` and `09_admin_order_realtime.sql` when you can access your Supabase project; `09` is optional for the order manager because polling stays enabled.

## Commands (Codespaces)
Upload the PATCH zip to `/workspaces/Chap-Khana` and run:

```bash
cd /workspaces/Chap-Khana
unzip -o Chap-Khana-v3.8.0-Advanced-Orders-Patch.zip -d /tmp/chap-v38
find /tmp/chap-v38 -maxdepth 2 -type d
rsync -av --exclude='.env.local' --exclude='.git' --exclude='node_modules' /tmp/chap-v38/Chap-Khana/ ./
node -p "require('./package.json').version"
npm ci
npm run test:catalog
npm test
npm run build
npm audit --omit=dev
```

Only if tests/build pass, remove ZIP from project root and push:
```bash
rm -f Chap-Khana-v3.8.0-Advanced-Orders-Patch.zip
git status --short
git add src/ tests/ docs/ package.json package-lock.json CHANGELOG-v3.md README.md START-HERE-BN.md
git commit -m "Add advanced admin order management v3.8"
git push origin main
```

## Live QA checklist
1. Sign in with approved Google admin account. Customer must not see admin orders.
2. Admin > Orders, filter by order code, customer name and phone individually.
3. Filter statuses. Check date boundary around midnight **Dhaka time**.
4. Create at least 20 test orders in staging; verify pagination / total count.
5. Open an order: verify menu line snapshot, quantity, original order amounts, delivery address and notes.
6. Print (or Save as PDF) a kitchen ticket. It should contain only the selected order, without the rest of the website.
7. Update an order's allowed status and verify list/details refreshed.
8. Create an order from another browser and verify Realtime/polling still refreshes the Orders tab.
9. After logging out, ensure Orders screen is inaccessible and sensitive order details are not shown.
10. Do **not** collect/save browser screenshots containing real customer phone/address data in public repositories.

## Notes
- Search matches within the selected field, not all three fields at once.
- An up-to-20-second delay is possible when SQL 09 is not enabled.
- This implementation uses existing Supabase RLS for authorization, not new public endpoints.
- Full build and real database test must pass before production launch. Restaurant operator should review printed ticket layout on its printer.
