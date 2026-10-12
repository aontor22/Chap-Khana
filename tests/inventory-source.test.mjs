import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const sql=read('supabase/migrations/14_inventory_management.sql');
const api=read('src/data/api.ts');
const admin=read('src/pages/Admin.tsx');
const ui=read('src/components/AdminInventory.tsx');
test('inventory migration is transactional and off by default',()=>{
 assert.match(sql,/^BEGIN;/m);assert.match(sql,/COMMIT;/);assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
 assert.doesNotMatch(sql,/(?:DROP TABLE|TRUNCATE|DELETE FROM public\.orders)/i);
});
test('ingredient and menu stock are staff-only while public reads get boolean availability',()=>{
 for(const name of ['inventory_ingredients','inventory_menu_stock','inventory_recipes','inventory_reservation_lines','inventory_movements'])assert.ok(sql.includes(`public.${name}`),name);
 assert.match(sql,/ALTER TABLE public.inventory_ingredients ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public.menu_inventory_availability\(\) TO anon,authenticated/);
 assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE).*ON public.inventory_reservation_lines/i);
 assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE).*ON public.inventory_movements/i);
});
test('order item insertion reserves all tracked resources in same checkout transaction',()=>{
 assert.match(sql,/inventory_order_item_reserve AFTER INSERT ON public.order_items/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION private.reserve_order_inventory/);
 assert.match(sql,/UPDATE public.inventory_menu_stock SET on_hand=on_hand-NEW.qty/);
 assert.match(sql,/UPDATE public.inventory_ingredients SET on_hand=on_hand-v_need/);
 assert.match(sql,/on_hand>=NEW.qty/);assert.match(sql,/on_hand>=v_need/);
 assert.match(sql,/inventory_reservation_lines\(order_item_id,resource_type,resource_id,quantity\)/);
});
test('status cancellation restores immutable reservation snapshot once',()=>{
 assert.match(sql,/inventory_order_cancel_restore AFTER UPDATE OF status/);
 assert.match(sql,/AND NOT r.released/);assert.match(sql,/SET released=true/);
 assert.match(sql,/Order cancellation refund/);
});
test('admin workflows use staff RPCs and never issue client-side balance mutations',()=>{
 assert.match(api,/inventory_configure_menu/);assert.match(api,/inventory_set_recipe/);assert.match(api,/inventory_adjust_stock/);
 assert.doesNotMatch(api,/from\('inventory_ingredients'\)\.update\(\{on_hand/);
 assert.match(admin,/AdminInventory/);
 for(const label of ['Inventory & recipe stock','Ingredients','Recipe per serving','Apply adjustment','Enable enforcement'])assert.ok(ui.includes(label),label);
});
test('customer-facing menu honors aggregated server inventory availability',()=>{
 assert.match(api,/rpc\('menu_inventory_availability'\)/);
 assert.match(read('src/components/DishCard.tsx'),/item.in_stock!==false/);
 assert.match(read('src/context/ShopContext.tsx'),/item.in_stock===false/);
 assert.match(read('src/lib/utils.ts'),/item.in_stock===false/);
});
test('whole-piece unit and recipe safeguards are applied in SQL and client checks',()=>{
 assert.match(sql,/inventory_piece_whole_units CHECK/);
 assert.match(sql,/Piece ingredients require whole number quantities/);
 assert.match(read('src/lib/inventory.ts'),/Number.isInteger\(value\)/);
});
