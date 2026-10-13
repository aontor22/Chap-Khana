import {describe,expect,it} from 'vitest';
import {batchExpiryStatus,stockDay,validateWaste,validBatchAmount,validateStocktakeCounts,stocktakeChanges} from '../src/lib/stockControl';
const ingredient={id:'i',name:'Chicken',unit:'g' as const,on_hand:1000,reorder_level:200,tracked:true,active:true};
describe('stock-control client-side validation',()=>{
 it('uses Bangladesh day instead of browser timezone',()=>{
   expect(stockDay(new Date('2026-10-12T18:10:00Z'))).toBe('2026-10-13');
 });
 it('distinguishes expired, near-expiry, unknown and safe dates',()=>{
   expect(batchExpiryStatus('2026-10-12','2026-10-13')).toBe('expired');
   expect(batchExpiryStatus('2026-10-13','2026-10-13')).toBe('soon');
   expect(batchExpiryStatus('2026-10-21','2026-10-13')).toBe('ok');
   expect(batchExpiryStatus(null,'2026-10-13')).toBe('unknown');
 });
 it('requires integer piece counts but accepts 3-place mass',()=>{
  expect(validBatchAmount(2.5,'piece')).toBe(false);
  expect(validBatchAmount(0.125,'kg')).toBe(true);
  expect(validBatchAmount(-1,'g')).toBe(false);
 });
 it('rejects negative, overflowing or unexplained waste',()=>{
  expect(validateWaste(7,'g','Expired',5)).toMatch(/exceed/);
  expect(validateWaste(3,'g','X',5)).toMatch(/reason/);
  expect(validateWaste(3,'g','Spoiled',5)).toBe(null);
 });
 it('counts zero as a valid physical reading',()=>{
  const lines=[{stocktake_id:'t',ingredient_id:'i',expected_qty:1000,counted_qty:null}];
  expect(validateStocktakeCounts(lines,{i:'0'},[ingredient])).toBe(null);
  expect(stocktakeChanges(lines,{i:'0'})).toBe(1);
 });
 it('does not allow blank counts or unknown ingredient codes',()=>{
  const lines=[{stocktake_id:'t',ingredient_id:'i',expected_qty:1000,counted_qty:null}];
  expect(validateStocktakeCounts(lines,{i:''},[ingredient])).toMatch(/every/);
  expect(validateStocktakeCounts(lines,{i:'123'},[])).toMatch(/missing/);
 });
});
