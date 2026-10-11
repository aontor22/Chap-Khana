import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const sql=read('supabase/migrations/13_customer_loyalty.sql');
test('loyalty migration is transactional and preserves old orders',()=>{
  assert.match(sql,/^BEGIN;/m);assert.match(sql,/COMMIT;/);
  assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDELETE FROM public\.orders\b|\bDROP TABLE\b/i);
  assert.match(sql,/ADD COLUMN IF NOT EXISTS loyalty_discount/);
  assert.match(sql,/orders_total_loyalty_check/);
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
});
test('wallet and points ledger are own-read only, never client writable',()=>{
  assert.match(sql,/ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/ALTER TABLE public.loyalty_events ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public.loyalty_settings,public.loyalty_accounts,public.loyalty_events FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/user_id=\(SELECT auth\.uid\(\)\)/);
  assert.doesNotMatch(sql,/GRANT (?:UPDATE|INSERT|DELETE).*ON public\.loyalty_accounts/);
});
test('redemption is authenticated, checked under locks, and idempotent',()=>{
  assert.match(sql,/Sign in to redeem loyalty points/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/v_wallet\.balance<p_redeem_points/);
  assert.match(sql,/v_max_discount/);
  assert.match(sql,/v_receipt:=private\.place_order_v3_impl/);
  assert.match(sql,/v_receipt:=private\.place_order_v2_impl/);
  assert.match(sql,/UPDATE public\.loyalty_accounts SET balance=balance-p_redeem_points/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.place_order_v4[^;]+TO authenticated/s);
});
test('points awarded on completed orders and returned on cancellation exactly once',()=>{
  assert.match(sql,/NEW\.status='completed'/);
  assert.match(sql,/NEW\.status='cancelled'/);
  assert.match(sql,/ON CONFLICT\(order_id,kind\) DO NOTHING/);
  assert.match(sql,/CREATE TRIGGER loyalty_status_change_trigger AFTER UPDATE OF status/);
  assert.match(sql,/lifetime_earned=lifetime_earned\+v_points/);
  assert.match(sql,/lifetime_redeemed=lifetime_redeemed-NEW\.loyalty_points_redeemed/);
});
test('admin, customer, checkout and receipt are connected to loyalty logic',()=>{
  assert.match(read('src/data/api.ts'),/place_order_v4/);
  assert.match(read('src/pages/Admin.tsx'),/AdminLoyalty/);
  assert.match(read('src/pages/Account.tsx'),/getLoyaltySnapshot/);
  assert.match(read('src/pages/Checkout.tsx'),/maxRedeemablePoints/);
  assert.match(read('src/pages/OrderConfirmation.tsx'),/loyalty_discount/);
});
