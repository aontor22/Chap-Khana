# Chap Khana v3.14 — Loyalty & Rewards (বাংলা)

## Installation
1. এই release আগের v3.13 source-এর ওপর ভিত্তি করে তৈরি। `12_coupon_campaigns.sql` সফল না হলে প্রথমে সেটি run করবে।
2. Production data backup ও staging test করার পর `supabase/migrations/13_customer_loyalty.sql` **একবার** SQL Editor-এ চালাবে।
3. GitHub-এ code push ও Vercel deploy করবে।
4. Admin → Rewards গিয়ে earning/redemption rules যাচাই করো। Program শুরুতে **OFF** থাকবে; live tests সম্পন্ন হলে ইচ্ছামতো ON করো।

## Rules
- Rewards শুধু login করা customer's eligible orders-এ প্রযোজ্য; guest orders-এ points জমে না।
- Staff order **Completed** করলে তবেই points earn হবে। Existing completed orders-এর ওপর retroactive points নেই।
- Checkout-এ redeem করতে login, sufficient balance ও minimum threshold প্রয়োজন। Server wallet row lock দিয়ে points reserve করে।
- Order **Cancelled** হলে redeemed points একবার ফেরত দেওয়া হয়।
- Coupon + item discounts আগে হিসাব হয়; loyalty redemption সেই discounted food value-এর ওপর সীমাবদ্ধ। Delivery fee-এর ওপর কোনো points discount নেই।
- `place_order_v2` ও `place_order_v3` guest এবং zero-redemption checkout-এর জন্য আগের মতো কাজ করবে।
- Admin settings পরিবর্তনের আগে owner-কে points economics (financial cost) নিশ্চিত করতে হবে।

## Live tests before enabling
- Sign-in customer completes one test order → points appear once.
- Repeat same request id → points/spend not doubled.
- Redeem some points → server returns correct total, ledger has one debit.
- Cancel an uncompleted order with redemption → wallet refunded once.
- Coupon + points combined total and maximum percentage tested.
- Unauthenticated customer cannot redeem; no direct browser INSERT/UPDATE on loyalty_accounts/events.
- Admin only can edit loyalty_settings; non-admin gets permission error.
- Turn rewards OFF and verify redemptions rejected without breaking normal checkout.

## Permissions verification query
```sql
SELECT
  to_regprocedure('public.place_order_v4(text,text,text,text,text,jsonb,uuid,text,integer)') IS NOT NULL AS rewards_checkout_ready,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='loyalty_status_change_trigger' AND NOT tgisinternal) AS earning_trigger_ready,
  NOT has_table_privilege('authenticated','public.loyalty_accounts','UPDATE') AS wallet_direct_write_denied;
```
The above is configuration verification only. A real end-to-end flow must be tested separately.
