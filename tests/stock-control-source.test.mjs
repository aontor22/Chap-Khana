import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const sql=read('supabase/migrations/17_waste_expiry_stocktake.sql');
const api=read('src/data/api.ts');
const control=read('src/components/AdminStockControl.tsx');
const inventory=read('src/components/AdminInventory.tsx');
test('v3.18 migration is atomic, additive and enforces purchasing prerequisite',()=>{
 assert.match(sql,/^BEGIN;/m);assert.match(sql,/^COMMIT;/m);
 assert.match(sql,/to_regclass\('public\.purchase_returns'\)/);
 assert.doesNotMatch(sql,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM public\.orders|UPDATE public\.orders SET)\b/i);
});
test('lot table and physical count records have staff-only reads and no client writes',()=>{
 for(const t of ['inventory_expiry_lots','inventory_stocktakes','inventory_stocktake_lines','inventory_lot_consumptions'])assert.ok(sql.includes(`public.${t}`),t);
 assert.match(sql,/ALTER TABLE public\.inventory_expiry_lots ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public\.inventory_expiry_lots/);
 assert.match(sql,/has_table_privilege\('authenticated','public\.inventory_expiry_lots','UPDATE'\)/);
 assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE) ON public\.inventory_expiry_lots/i);
});
test('existing orders, purchases, supplier returns, and cancellation refunds share lot-movement trigger',()=>{
 assert.match(sql,/inventory_movement_apply_lots AFTER INSERT ON public\.inventory_movements/);
 assert.match(sql,/NEW\.reason='Order cancellation refund'/);
 assert.match(sql,/NEW\.reason<>'Order reservation' OR expires_on IS NULL OR expires_on>=v_today/);
 assert.match(sql,/INSERT INTO public\.inventory_lot_consumptions/);
 assert.match(sql,/opening lot/i);
});
test('waste is staff-only, deduplicated and rejects negative inventory',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.inventory_record_waste/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/WHERE request_id=p_request/);
 assert.match(sql,/on_hand>=p_qty/);
 assert.match(sql,/p_lot/);
});
test('stocktake protects live stock against stale counts and repeat submission',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.inventory_post_stocktake/);
 assert.match(sql,/v_take\.posted_payload=p_counts/);
 assert.match(sql,/v_record\.on_hand<>v_record\.expected_qty/);
 assert.match(sql,/inventory_adjust_stock\('ingredient'/);
 assert.match(sql,/Count every stocktake ingredient exactly once/);
});
test('public availability is calculated using non-expired batches, without exposing counts',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.menu_inventory_availability\(\)/);
 assert.match(sql,/sum\(l\.remaining_qty\)/);
 assert.match(sql,/Asia\/Dhaka/);
 assert.doesNotMatch(sql,/GRANT SELECT ON public\.inventory_expiry_lots TO anon/);
});
test('admin UI exposes all workflows and calls only protected RPCs',()=>{
 for(const call of ['inventory_tag_lot','inventory_split_lot','inventory_record_waste','inventory_start_stocktake','inventory_post_stocktake'])assert.ok(api.includes(`rpc('${call}'`),call);
 for(const label of ['Expiry batches','Record waste','Physical stocktake','Post verified counts'])assert.ok(control.includes(label),label);
 assert.match(inventory,/AdminStockControl/);
 assert.doesNotMatch(api,/from\('inventory_expiry_lots'\)\.update\(/);
});
