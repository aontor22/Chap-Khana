import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const sql=read('supabase/migrations/18_kitchen_display_workflow.sql');
const api=read('src/data/api.ts');
const ui=read('src/components/AdminKitchen.tsx');
const admin=read('src/pages/Admin.tsx');
const lib=read('src/lib/kitchen.ts');
test('SQL 18 additive transaction and requires existing status audit',()=>{
  assert.match(sql,/^BEGIN;/m);assert.match(sql,/^COMMIT;/m);
  assert.match(sql,/to_regclass\('public\.order_status_events'\)/);
  assert.doesNotMatch(sql,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM public\.orders|UPDATE public\.inventory_ingredients)\b/i);
});
test('staff-only CAS transition locks the order and compares expected state',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.kitchen_advance_order\(/);
  assert.match(sql,/SECURITY DEFINER SET search_path=''/);
  assert.match(sql,/private\.is_staff\(\)/);
  assert.match(sql,/WHERE id=p_order FOR UPDATE/);
  assert.match(sql,/v_status<>p_expected_status/);
  assert.match(sql,/p_next_status<>v_allowed/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.kitchen_advance_order\(uuid,text,text\) TO authenticated/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.kitchen_advance_order\(uuid,text,text\) FROM PUBLIC,anon,authenticated/);
});
test('delivery and pickup have different handoff transitions',()=>{
  assert.match(sql,/WHEN v_fulfillment='delivery' THEN 'out_for_delivery' ELSE 'completed'/);
  assert.match(lib,/fulfillment==='delivery'\?'out_for_delivery':'completed'/);
  assert.doesNotMatch(sql,/\bWHEN 'cancelled' THEN/);
});
test('queue queries only active orders, old-first, and minimizes PII',()=>{
  assert.match(api,/getKitchenQueue/);
  assert.match(api,/\.in\('status',\[\.\.\.KITCHEN_ACTIVE_STATUSES\]\)/);
  assert.match(api,/\.order\('created_at',\{ascending:true\}\)\.limit\(100\)/);
  assert.match(api,/\.select\('id,code,status,fulfillment_type,created_at,updated_at,notes,order_items\(item_name,qty\)'\)/);
  assert.match(api,/rpc\('kitchen_advance_order'/);
  assert.doesNotMatch(api,/from\('orders'\)\.update\(\{status:next\}\)/);
});
test('kitchen UI offers a refresh and safe progressing action',()=>{
  for(const value of ['Kitchen display','Kitchen instructions','Mark ready','Order Management','Auto-refresh 12 seconds']){
    assert.ok((ui+lib).includes(value),value);
  }
  assert.match(ui,/getKitchenStatusEvents/);
  assert.match(ui,/document\.visibilityState==='visible'/);
  assert.match(ui,/await advanceKitchenOrder\(order,next\)/);
  assert.match(admin,/AdminKitchen live=\{live\}/);
});
test('uses existing status audit rather than a second ledger',()=>{
  assert.match(api,/\.from\('order_status_events'\)/);
  assert.doesNotMatch(sql,/CREATE TABLE/);
  assert.doesNotMatch(sql,/CREATE TRIGGER/);
});
