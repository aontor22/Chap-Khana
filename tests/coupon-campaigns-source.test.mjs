import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const sql=read('supabase/migrations/12_coupon_campaigns.sql');
test('new migration preserves existing order rows and data',()=>{
  assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);
  assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDELETE FROM\s+public\.orders\b|\bDROP TABLE\b/i);
  assert.match(sql,/coupon_discount/);assert.match(sql,/orders_total_coupon_check/);
});
test('coupon usage limits serialized in a DB transaction with request idempotency',()=>{
  assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/coupon_campaigns WHERE code=v_code FOR UPDATE/);
  assert.match(sql,/client_request_id=p_request_id/);assert.match(sql,/v_campaign\.used_count>=v_campaign\.max_uses/);
  assert.match(sql,/private\.place_order_v2_impl/);
  assert.match(sql,/INSERT INTO public\.coupon_redemptions/);
});
test('database refuses guest campaign table reads and non-staff ledger writes',()=>{
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.coupon_campaigns FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/private\.is_staff\(\)/);
  assert.match(sql,/has_table_privilege\('anon','public\.coupon_campaigns','SELECT'\)/);
});
test('server calculates quote and final discount from catalog and maintains reports',()=>{
  assert.match(sql,/public\.quote_coupon/);
  assert.match(sql,/public\.menu_items/);
  assert.match(sql,/v_order\.subtotal/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.staff_sales_report/);
  assert.match(sql,/SUM\(coupon_discount\)/);
});
test('React admin and checkout are connected to safe coupon APIs',()=>{
  const api=read('src/data/api.ts');const checkout=read('src/pages/Checkout.tsx');const admin=read('src/pages/Admin.tsx');
  assert.match(api,/place_order_v3/);assert.match(api,/quote_coupon/);
  assert.match(checkout,/quoteCoupon/);assert.match(checkout,/approvedQuote\?\.code/);
  assert.match(admin,/AdminCoupons/);
});
