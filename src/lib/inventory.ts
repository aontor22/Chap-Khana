export type IngredientUnit = 'g'|'kg'|'ml'|'l'|'piece';
export type InventoryKind = 'menu'|'ingredient';
export interface Ingredient {id:string;name:string;unit:IngredientUnit;on_hand:number;reorder_level:number;tracked:boolean;active:boolean;created_at?:string}
export interface MenuStock {menu_item_id:string;on_hand:number;reorder_level:number;tracked:boolean}
export interface RecipeLine {menu_item_id:string;ingredient_id:string;quantity_per_item:number}
export interface InventoryMovement {id:number;resource_type:InventoryKind;resource_id:string;delta:number;reason:string;order_id:string|null;created_at:string}
export interface InventorySnapshot {enabled:boolean;ingredients:Ingredient[];menuStock:MenuStock[];recipes:RecipeLine[];movements:InventoryMovement[]}
export const EMPTY_INVENTORY:InventorySnapshot={enabled:false,ingredients:[],menuStock:[],recipes:[],movements:[]};
export const INVENTORY_UNITS:IngredientUnit[]=['g','kg','ml','l','piece'];
export function validStockQuantity(value:number,unit:'servings'|IngredientUnit):boolean {
  return Number.isFinite(value)&&value>=0&&value<=1000000&&Math.round(value*1000)===value*1000&&(unit!=='servings'&&unit!=='piece'||Number.isInteger(value));
}
export function validDelta(value:number,unit:'servings'|IngredientUnit):boolean {
  return value!==0&&validStockQuantity(Math.abs(value),unit);
}
export function validateIngredient(data:Pick<Ingredient,'name'|'unit'|'reorder_level'>):string|null {
  if(data.name.trim().length<2||data.name.trim().length>100)return 'Ingredient name must have 2–100 characters.';
  if(!INVENTORY_UNITS.includes(data.unit))return 'Choose a valid stock unit.';
  if(!validStockQuantity(data.reorder_level,data.unit))return 'Invalid low-stock threshold.';
  return null;
}
export function validateRecipe(lines:Array<Pick<RecipeLine,'ingredient_id'|'quantity_per_item'>>,ingredients:Ingredient[]):string|null {
  if(lines.length>50)return 'Maximum 50 ingredients per recipe.';
  if(new Set(lines.map(x=>x.ingredient_id)).size!==lines.length)return 'Duplicate ingredient in recipe.';
  for(const line of lines){const ing=ingredients.find(x=>x.id===line.ingredient_id);
    if(!ing)return 'Recipe includes an unknown ingredient.';
    if(!validStockQuantity(line.quantity_per_item,ing.unit)||line.quantity_per_item===0)return `Invalid amount for ${ing.name}.`;
  }
  return null;
}
export function ingredientLowStock(i:Ingredient){return i.tracked&&(!i.active||i.on_hand<=i.reorder_level);}
export function menuLowStock(i:MenuStock){return i.tracked&&i.on_hand<=i.reorder_level;}
