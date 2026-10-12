import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/15_supplier_purchasing.sql');
const api=read('src/data/api.ts');const admin=read('src/pages/Admin.tsx');const ui=read('src/components/AdminPurchasing.tsx');

test('purchasing is additive and requires inventory migration',()=>{
 assert.match(sql,/^BEGIN;/m);assert.match(sql,/COMMIT;\s*$/);
 assert.match(sql,/Run inventory migration 14/);
 assert.doesNotMatch(sql,/(?:DROP TABLE|TRUNCATE|DELETE FROM public\.orders|UPDATE public\.menu_items)/i);
});
test('suppliers and purchasing data require staff authorization and RLS',()=>{
 for(const name of ['purchase_suppliers','purchase_orders','purchase_order_lines','purchase_receipts','purchase_receipt_lines']){
  assert.match(sql,new RegExp(`ALTER TABLE public\\.${name} ENABLE ROW LEVEL SECURITY`));
  assert.match(sql,new RegExp(`public\\.${name}`));
 }
 assert.match(sql,/private\.is_staff\(\)/);
 assert.doesNotMatch(sql,/GRANT (INSERT|UPDATE|DELETE).*ON public\.purchase_order_lines TO authenticated/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.purchase_create_order/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.purchase_create_order/);
});
test('all purchase changes flow through protected RPC, no direct browser stock mutation',()=>{
 for(const f of ['purchase_create_order','purchase_change_status','purchase_receive'])assert.match(api,new RegExp(`rpc\\('${f}'`));
 assert.doesNotMatch(api,/from\('inventory_ingredients'\)\.update\(\{on_hand/);
 assert.match(sql,/UPDATE public\.inventory_ingredients SET on_hand=on_hand\+v_qty/);
 assert.match(sql,/INSERT INTO public\.inventory_movements/);
});
test('receiving prevents over-receiving, requires ordered status, and supports idempotent retries',()=>{
 assert.match(sql,/FOR UPDATE;/);
 assert.match(sql,/v_status NOT IN \('ordered','partially_received'\)/);
 assert.match(sql,/received_qty\+v_qty>v_line\.quantity/);
 assert.match(sql,/request_id uuid NOT NULL UNIQUE/);
 assert.match(sql,/request_payload=p_lines THEN RETURN v_existing\.id/);
 assert.match(sql,/Receipt request ID already used with different data/);
 assert.match(sql,/received_qty=received_qty\+v_qty/);
});
test('purchasing UI exposes supplier editing, draft ordering, receiving and receipt history',()=>{
 for(const value of ['Add supplier','Create draft','Receive goods','Recent goods receipts','Mark ordered'])assert.ok(ui.includes(value),value);
 assert.match(admin,/AdminPurchasing/);
 assert.match(admin,/\['purchasing',Truck,'Purchasing'\]/);
 assert.match(ui,/requestId\.current=crypto\.randomUUID/);
});
test('purchase amounts use explicit decimal and ingredient-unit validation',()=>{
 assert.match(sql,/unit='piece' AND v_qty<>trunc\(v_qty\)/);
 assert.match(read('src/lib/purchasing.ts'),/validPurchaseQuantity/);
 assert.match(read('src/lib/purchasing.ts'),/validateReceipt/);
});
