import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const sql=read('supabase/migrations/16_purchase_returns_payments.sql');
const api=read('src/data/api.ts');
const ui=read('src/components/AdminPurchaseFinance.tsx');
const purchasing=read('src/components/AdminPurchasing.tsx');
const lib=read('src/lib/purchasing.ts');
test('migration 16 is additive, atomic and checks purchasing prerequisite',()=>{
 assert.match(sql,/^BEGIN;/m);assert.match(sql,/COMMIT;\s*$/);
 assert.match(sql,/Apply purchase migration 15 before migration 16/);
 assert.doesNotMatch(sql,/\b(DROP TABLE|TRUNCATE|DELETE FROM public\.orders|UPDATE public\.menu_items)\b/i);
});
test('returns and payments are staff readable only and immutable from browser clients',()=>{
 for(const table of ['purchase_returns','purchase_return_lines','purchase_payments']){
  assert.match(sql,new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  assert.match(sql,new RegExp(`purchase_${table.replace('purchase_','')}_staff_select`));
 }
 assert.match(sql,/REVOKE ALL ON public\.purchase_returns/);
 assert.match(sql,/No INSERT\/UPDATE\/DELETE permissions to browser clients/);
 assert.match(sql,/private\.is_staff\(\)/);
});
test('supplier return is tied to receipt and cannot over-return or make stock negative',()=>{
 assert.match(sql,/purchase_receipt_lines\(receipt_id,order_line_id\)/);
 assert.match(sql,/v_qty\+v_returned>v_line\.received_qty/);
 assert.match(sql,/on_hand=on_hand-v_qty/);
 assert.match(sql,/on_hand>=v_qty/);
 assert.match(sql,/INSERT INTO public\.inventory_movements/);
 assert.match(sql,/Supplier return/);
 assert.match(sql,/RETURN v_return/);
});
test('supplier payments never exceed net received quantity and preserve audit reference',()=>{
 assert.match(sql,/p_amount>v_receipts-v_returns-v_paid/);
 assert.match(sql,/purchase_financial_summary\(uuid\[\]\)/);
 assert.match(sql,/supplier_credit numeric/);
 assert.match(sql,/payment_method text NOT NULL/);
 assert.match(sql,/paid_on date NOT NULL/);
 assert.match(sql,/request_id uuid NOT NULL UNIQUE/);
});
test('returns and payments use idempotency keys and staff-only RPC functions',()=>{
 for(const name of ['purchase_return_goods','purchase_record_payment']){
  assert.match(api,new RegExp(`rpc\\('${name}'`));
  assert.match(sql,new RegExp(`public\\.${name}\\(`));
 }
 assert.match(sql,/request_payload=p_lines/);
 assert.match(sql,/Return request ID already used with different data/);
 assert.match(sql,/Payment request ID already used with different data/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.purchase_financial_summary/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.purchase_financial_summary/);
});
test('supplier finance panel integrated without changing v3.16 receipt workflow',()=>{
 assert.match(purchasing,/AdminPurchaseFinance/);
 assert.match(purchasing,/section==='finance'/);
 assert.match(purchasing,/Receive goods/);
 assert.match(ui,/Record supplier payment/);
 assert.match(ui,/Return received goods/);
 assert.match(ui,/requestId|paymentRequest/);
 assert.match(lib,/validateGoodsReturn/);
 assert.match(lib,/validateSupplierPayment/);
});
test('missing migration 16 leaves existing supplier purchasing available',()=>{
 assert.match(api,/missingFinanceMigration/);
 assert.match(api,/financeAvailable:!unavailable/);
 assert.match(ui,/Migration 16 is not applied yet/);
});
