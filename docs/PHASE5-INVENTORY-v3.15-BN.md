# Chap Khana v3.15 — Inventory (English / বাংলা setup)

## Architecture
- **Menu-item serving stock:** optional finished-serving caps per menu item. Each accepted order deducts 1 serving per quantity.
- **Ingredient stock:** track chicken (g or kg), spices (g), oil (ml or l), bread (piece), etc. Recipe quantities use each ingredient's **own configured unit**. No automatic kg↔g conversion.
- Either or both rules can apply to the same dish. This counts two *different resources* (sellable portions and raw ingredient quantities), not the same stock twice. If a prepared item has already consumed ingredients when produced, adjust the corresponding recipe/tracking rules to avoid operational double counting.
- **Unconfigured dishes are unrestricted.** Enabling inventory is not a guarantee that every food is stock-controlled: create item rules/recipes first.
- Stock is **reserved when a new order is placed**, not after it completes; this prevents accepting more orders than ingredients available.
- **Cancelled orders restore the exact order-time snapshot once**. Completed orders remain consumed. Old/historical orders are not backfilled.
- All stock-changing operations run in PostgreSQL, never using client-sent prices or client-side stock checks alone.
- Movement ledger saves manual restocks/corrections, order consumption and cancellation refunds. Order/items/customer financial logic remains unchanged.
- Dashboard/Storefront: private stock counts visible to authorized admins only; public menu can receive only an `in_stock` boolean via `menu_inventory_availability()` RPC.

## Setup / Deployment
1. Backup the production Supabase database and test in staging first.
2. Confirm migrations `01–13` are applied, including loyalty SQL 13.
3. Run **only** `supabase/migrations/14_inventory_management.sql` in Supabase SQL Editor. Inventory starts OFF, so production menu continues as before.
4. Merge v3.15 React patch, run `npm ci && npm run test:catalog && npm test && npm run build` in Codespaces, and deploy to Vercel.
5. Admin → Inventory → Ingredients: create ingredients, choose units and low-stock levels; restock through **Adjust stock** (positive quantity).
6. Admin → Inventory → Menu servings: choose each dish, opt into stock-tracked servings, save and restock (if needed).
7. Admin → Inventory → Recipes: set exact ingredient quantity for ONE portion, save.
8. Only when you have reviewed all required dishes/quantities, click **Enable enforcement**. If uncertain, keep inventory OFF.

**SQL verification:**
```sql
SELECT enabled FROM public.inventory_settings WHERE id=1;  -- false on first install
SELECT count(*) FROM public.inventory_ingredients;
SELECT count(*) FROM public.inventory_recipes;
SELECT has_function_privilege('anon','public.menu_inventory_availability()','EXECUTE') AS menu_availability_read,
 has_table_privilege('anon','public.inventory_ingredients','SELECT') AS guest_can_read_stock,
 has_table_privilege('authenticated','public.inventory_movements','INSERT') AS browser_can_fake_movement;
-- Expected: true, false, false
```

## Suggested staging QA (critical)
- Set up **Chicken Chap**: track finished portions = 3; create Chicken (g) stock = 500g, recipe 200g/portion. Enable inventory.
- Order 2 portions: succeeds; remaining finished portions = 1 and ingredient stock = 100g.
- Order another 1 portion: should FAIL because chicken needs 200g. Confirm NO new order, coupon redemption, loyalty debit or inventory movement is committed for failed checkout.
- Cancel first order via Admin Orders: quantities restore to 3 portions and 500g. Cancel again must not be possible / no double credit.
- Edit recipe after order, then cancel an order: refund uses original snapshot quantities, not new recipe.
- Test multiple simultaneous orders with the last item in stock; one should fail rather than oversell.
- Test regular customer or anonymous access to `inventory_ingredients`, `inventory_movements` and mutation RPCs: must be DENIED.
- Test order flows **without coupon** (`place_order_v2`), **with coupon** (`v3`), **with loyalty redemption** (`v4`) and ensure identical stock enforcement.
- Test `/menu` displays sold-out status; under changing stock conditions, checkout is the final arbiter.
- Try negative admin adjustments beyond on-hand: must be denied without ledger entry.
- Disable enforcement after tests if you are not ready to run it continuously.

## Rollout notes
- No ingredient/recipe rows are seeded: your restaurant must define its actual ingredients and recipes. Example quantities above are synthetic QA data.
- If SQL 14 is not yet applied, the old menu/ordering routes continue; inventory admin shows a migration error and no stock rules are enforced.
- Inventory workflow does not yet include supplier purchase orders, manufacturing/prep batches, expiration/lot traceability or accounting cost of goods sold. Build these separately if operationally required.
- Live Supabase staging transactions, RLS denial tests and full Vite browser E2E need to be completed in your own deployment. Static tests alone cannot prove financial correctness.
