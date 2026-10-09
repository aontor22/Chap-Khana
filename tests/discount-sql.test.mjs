import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/migrations/06_item_discounts.sql',import.meta.url),'utf8');
const api = readFileSync(new URL('../src/data/api.ts',import.meta.url),'utf8');

test('migration is non-destructive to orders and catalog',()=>{
  assert.doesNotMatch(sql,/\b(drop table|truncate|delete from|update public\.orders set (subtotal|total)|update public\.order_items set)\b/i);
  assert.match(sql,/ADD COLUMN IF NOT EXISTS discount_type/);
  assert.match(sql,/ADD COLUMN IF NOT EXISTS original_unit_price/);
  assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
});
test('database calculates percentage and fixed offers from trusted menu rows, no client price',()=>{
  assert.match(sql,/v_menu.discount_type='percent'/);
  assert.match(sql,/v_menu.discount_type='fixed'/);
  assert.match(sql,/v_menu.price - v_menu.discount_value/);
  assert.match(sql,/v_subtotal := v_subtotal \+ v_unit_price \* v_line.qty/);
  assert.match(sql,/for share/i);
  assert.match(sql,/discount_unit_amount,qty,line_total/);
  assert.doesNotMatch(api,/p_discount|p_price|unit_price:.*p_items/);
});
test('v2 order RPC remains in place, menu RLS and grants unchanged',()=>{
  assert.match(sql,/create or replace function private.place_order_impl/);
  assert.doesNotMatch(sql,/create or replace function private.place_order_v2_impl/);
  assert.doesNotMatch(sql,/grant all on/);
});
