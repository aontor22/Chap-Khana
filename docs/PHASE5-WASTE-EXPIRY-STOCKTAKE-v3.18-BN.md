# Chap Khana v3.18 — Waste, Expiry Lots, Physical Stocktake

## Before update
- Source base v3.17.0, including the `PurchaseBalance` import fix.
- Back up Supabase Cloud, ideally take a staging database copy first.
- Apply migration 17 AFTER all earlier migrations 01–16. The release preserves existing physical `on_hand` numbers and adds an unknown-expiry opening lot for each stocked ingredient.
- This migration cannot infer historical purchase-batch expiry dates. Tag/split existing stock only after checking real packaging.

## Source setup
```bash
npm ci
npm run test:catalog
npm test
npm run build
npm audit --omit=dev
```
Admin → Inventory → **Waste, expiry & counts**.

## Expiry lots
- Every ingredient increase through purchasing (`purchase_receive`), cancellations, stock adjustments or stocktake gains creates a new **unknown-expiry lot**. Tag the lot number and date once the actual label is checked.
- If one delivery contains different expiry dates, split the corresponding lot into distinct batches. Split is quantity-neutral.
- When inventory enforcement is ON, new order reservations consume ingredient lots FEFO (earliest expiry first), excluding lots expired according to Asia/Dhaka date. If inventory enforcement is OFF, checkout intentionally does not enforce stock or expiry. Unknown-expiry lots remain sellable until tagged, so verify them ASAP.
- Original order cancellation restores the original lot allocations and expiry when the order was placed after migration 17. Historical pre-migration reservations restore as unknown-expiry lots.
- Batches with expired quantities are **not auto-discarded**. Staff must physically dispose and record waste on the selected batch, which reduces stock and logs the loss. Do not assume expiry means the product has already been disposed.
- Supplier returns from the existing v3.17 workflow deduct available batches using FEFO; they do not automatically select the exact original received batch. Review lots when processing returns.

## Waste
- Select Ingredient or Menu, optionally a specific ingredient batch, positive quantity and reason.
- The server rejects negative stock and duplicate changed-content requests. It records both an ingredient/menu movement and batch deduction in a single transaction.
- Legacy `Adjust stock` remains available; prefer Waste to categorize actual losses.

## Physical stocktaking
- Start a draft for 1–200 active, tracked ingredients. Physically count every ingredient and enter a real number (zero is allowed). No prefilled count is supplied.
- Posting rejects changed stock since snapshot creation; start a fresh stocktake after reviewing changes. Successful posting records audited adjustments to the same inventory and lot ledger.
- Posting an already-posted session with identical counts is idempotent.
- Only one latest draft is shown by the UI. Avoid starting overlapping drafts; no automatic deletion of old draft records is provided.

## Staging test plan (must complete before production)
1. Create two purchase receipts for one ingredient; tag expiry dates, verify aggregate `inventory_ingredients.on_hand` equals sum of lot remaining balances.
2. Turn on existing inventory enforcement in staging and order a recipe-backed dish. Check FEFO lot deductions, quantity snapshots and cancelled-order restoration.
3. Set a lot expiry to yesterday; verify customer menu marks dish unavailable when only expired stock remains, and API rejects checkout even if aggregate `on_hand` still contains that quantity.
4. Record waste for a selected expired lot; confirm it decreases BOTH aggregate balance and that lot. Retry with same request ID: no second debit.
5. Start physical stocktake, post lower count, verify movement reason. Repeat identical post: unchanged. Start a different draft; place an order; then try posting stale count: MUST fail without modifying balances.
6. Repeat with coupon `place_order_v3`, loyalty `place_order_v4`, supplier receiving and supplier returns. Verify failed orders/receipts leave everything unchanged.
7. Try new RPCs as anon, non-staff and staff. Only staff may manage lots, waste and stocktake; anon must never see lot quantities or stocktake records.

## Example read-only validation query (run as trusted SQL Editor owner)
```sql
SELECT i.name, i.on_hand, COALESCE(sum(l.remaining_qty),0) AS lot_total,
 i.on_hand-COALESCE(sum(l.remaining_qty),0) AS difference
FROM public.inventory_ingredients i LEFT JOIN public.inventory_expiry_lots l ON l.ingredient_id=i.id
GROUP BY i.id,i.name,i.on_hand
HAVING i.on_hand<>COALESCE(sum(l.remaining_qty),0);
```
Expected: **0 rows**.

## Rollout and limitations
- SQL 17 is an ADDITIVE schema migration, but it adds a new trigger to every existing ingredient movement and replaces the menu availability RPC. Run on staging first, ensure DB backup and an agreed maintenance window before production.
- SQL Editor success, Node regex checks and a frontend build **do not substitute** for real concurrent database transaction tests.
- FEFO is batch **quantity** allocation, not physically enforcing which batch staff pick in the kitchen. Instruct kitchen to pick the same order.
- Reporting of waste monetary valuation / supplier accounting impact is not included in this release; this adds quantity records only.
- Dates are calendar dates, not laboratory guarantees of food safety. Apply relevant food-handling and disposal policies.
