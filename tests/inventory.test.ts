import {describe,it,expect} from 'vitest';
import {ingredientLowStock,menuLowStock,validDelta,validateIngredient,validateRecipe,validStockQuantity,type Ingredient} from '../src/lib/inventory';
const sample:Ingredient={id:'a',name:'Chicken',unit:'g',on_hand:800,reorder_level:400,tracked:true,active:true};
describe('inventory validation',()=>{
 it('accepts precise metric quantities and rejects negative stock',()=>{
  expect(validStockQuantity(2.125,'kg')).toBe(true);expect(validStockQuantity(-1,'g')).toBe(false);
 });
 it('requires integer portions and pieces',()=>{
  expect(validStockQuantity(2.5,'servings')).toBe(false);expect(validStockQuantity(2,'piece')).toBe(true);
 });
 it('rejects invalid adjustment deltas',()=>{
  expect(validDelta(0,'g')).toBe(false);expect(validDelta(-10,'g')).toBe(true);expect(validDelta(-0.25,'servings')).toBe(false);
 });
 it('validates ingredient name and threshold',()=>{
  expect(validateIngredient(sample)).toBe(null);
  expect(validateIngredient({...sample,name:'x'})).toMatch(/name/);
 });
 it('rejects duplicate recipe entries',()=>{
  expect(validateRecipe([{ingredient_id:'a',quantity_per_item:100},{ingredient_id:'a',quantity_per_item:50}],[sample])).toMatch(/Duplicate/);
 });
 it('rejects zero or missing ingredient recipes',()=>{
  expect(validateRecipe([{ingredient_id:'a',quantity_per_item:0}],[sample])).toMatch(/Invalid/);
  expect(validateRecipe([{ingredient_id:'z',quantity_per_item:100}],[sample])).toMatch(/unknown/);
 });
 it('flags low stock without flagging untracked resources',()=>{
  expect(ingredientLowStock({...sample,on_hand:200})).toBe(true);
  expect(ingredientLowStock({...sample,on_hand:0,tracked:false})).toBe(false);
  expect(menuLowStock({menu_item_id:'x',on_hand:1,reorder_level:2,tracked:true})).toBe(true);
 });
});
