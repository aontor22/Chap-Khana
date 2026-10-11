# Chap Khana v3.13.0 — Coupons (বাংলা Guide)

এটি **v3.12.0**-এর ওপর তৈরি করা incremental release। Customer loyalty points এই version-এ **যোগ করা হয়নি**; coupon campaigns একাই একটি financial feature এবং আগে সেটি verify করা জরুরি।

## কী এসেছে

- Admin → **Coupons**: নতুন campaign, percent/fixed BDT, max discount, minimum basket, max total redemptions, optional start/end date, enable/disable.
- Checkout → coupon code / Apply / Remove. Existing item-wise discounts আগে প্রয়োগ হবে; **একটি** cart-level coupon সেই discounted subtotal-এর ওপর প্রযোজ্য হবে। Delivery fee discount-এর আওতায় নয়।
- Final price ও discount হিসাব **database-এ**; client input price হিসেবে বিশ্বাস করা হয় না।
- `coupon_redemptions` ledger / coupon usage cap / retry-safe `place_order_v3`.
- Admin order print এবং customer receipt-এ coupon savings, completed-order analytics-এ basket-level coupon savings.
- Demo-only coupon `DEMO10`. এটি live database-এ তৈরি হয় না।

## Important migration

Production database-এ SQL `01`–`11` সফল থাকার পরেই:

`supabase/migrations/12_coupon_campaigns.sql`

SQL Editor থেকে **পুরো file** একবার run করো। আগে staging database-এ run ও checkout tests করা ভালো। এটি পুরোনো order amounts পরিবর্তন করে না। শুধু নতুন coupon tables, coupon order fields, total-check constraint, coupon quote/checkout RPC, analytics aggregate update করে।

**Critical:** New React code live deploy করার আগে migration **12** run করো অথবা live coupon feature test না করে checkout-এর normal flow ব্যবহার করো। Coupon ছাড়া checkout `place_order_v2` ব্যবহার করবে। Migration শেষ না হলে live Coupons admin screen / Apply button কাজ করবে না।

## Verification SQL

```sql
SELECT
  to_regprocedure('public.quote_coupon(text,jsonb,text)') IS NOT NULL AS quote_ready,
  to_regprocedure('public.place_order_v3(text,text,text,text,text,jsonb,uuid,text)') IS NOT NULL AS checkout_ready,
  to_regclass('public.coupon_redemptions') IS NOT NULL AS ledger_ready,
  has_table_privilege('anon','public.coupon_campaigns','SELECT') AS public_can_list_campaigns,
  has_table_privilege('authenticated','public.coupon_redemptions','INSERT') AS clients_can_forge_redemptions;
```

Expected: `true,true,true,false,false`. These checks do not replace tests using an actual staff/customer session.

## Live QA

1. Admin Google account → Coupons → create `WELCOME10`, 10% discount, minimum ৳200, max discount ৳100, max uses 2, enabled.
2. Customer cart with at least ৳200 food subtotal → Apply `WELCOME10`; confirm preview displays a coupon saving.
3. Submit controlled test order. Check receipt, kitchen ticket, order total, `orders.coupon_discount`, redemption ledger. **Do not use real customer information during testing.**
4. Check the same request UUID retry returns the original receipt and does not count a second redemption. Separate new UUID orders should use up allowed redemptions, then reject an extra order.
5. Unapproved customer should not list/edit coupon_campaigns or see redemptions; allowed staff can.
6. Completed-order reports should include coupon savings in total/daily savings; item breakdown only shows item-level savings.
7. Deactivate promotion; future checkout must reject the code. Test code-free checkout too.

**Usage definition:** redemption is counted at successful order placement, *including later-cancelled orders*. It is NOT refunded on cancellation. No per-customer restriction or loyalty points exists yet; max_uses is a global count. Guest checkout remains available.

**Known limitations:** Server-side IP/CAPTCHA controls still depend on deployment. Production integration and load/concurrency tests must run against staging Supabase; this package alone is not evidence of live database safety. Payments are still COD/pickup, not online payments.

## Codespaces install/build

```bash
npm ci
npm run test:catalog
npm test
npm run build
npm audit --omit=dev
```
