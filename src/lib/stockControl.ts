import type { Ingredient, IngredientUnit } from './inventory';

export interface ExpiryLot {
 id:string;ingredient_id:string;batch_code:string;expires_on:string|null;
 received_qty:number;remaining_qty:number;source_movement_id:number|null;
 source_kind:'movement'|'opening'|'split';created_at:string;
}
export interface Stocktake {id:string;status:'draft'|'posted';notes:string;created_at:string;posted_at:string|null;}
export interface StocktakeLine {stocktake_id:string;ingredient_id:string;expected_qty:number;counted_qty:number|null;}
export interface StockControlSnapshot {available:boolean;lots:ExpiryLot[];stocktakes:Stocktake[];lines:StocktakeLine[];}
export const EMPTY_STOCK_CONTROL:StockControlSnapshot={available:false,lots:[],stocktakes:[],lines:[]};
export const stockDay=(date:Date=new Date()):string=>{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const get=(part:string)=>parts.find(x=>x.type===part)?.value||'';
 return `${get('year')}-${get('month')}-${get('day')}`;
};
export function batchExpiryStatus(expiresOn:string|null,today=stockDay()):'unknown'|'expired'|'soon'|'ok'{
 if(!expiresOn)return 'unknown';
 if(expiresOn<today)return 'expired';
 const days=(Date.parse(`${expiresOn}T00:00:00Z`)-Date.parse(`${today}T00:00:00Z`))/86400000;
 return days<=7?'soon':'ok';
}
export function validBatchAmount(qty:number,unit:IngredientUnit):boolean{
 return Number.isFinite(qty)&&qty>0&&qty<=1000000&&Math.abs(Math.round(qty*1000)-qty*1000)<1e-7&&(unit!=='piece'||Number.isInteger(qty));
}
export function validateWaste(quantity:number,unit:IngredientUnit|'servings',reason:string,balance:number):string|null{
 if(!validBatchAmount(quantity,unit==='servings'?'piece':unit))return 'Enter a valid positive quantity in the ingredient stock unit.';
 if(quantity>balance)return 'Waste cannot exceed the available stock.';
 if(reason.trim().length<2||reason.trim().length>190)return 'Enter a waste reason (2–190 characters).';
 return null;
}
export function validateStocktakeCounts(lines:StocktakeLine[],input:Record<string,string>,ingredients:Ingredient[]):string|null{
 if(!lines.length)return 'No stocktake lines found.';
 for(const line of lines){
  const raw=input[line.ingredient_id];
  if(raw===undefined||raw.trim()==='')return 'Count every ingredient; use 0 if none remains.';
  const ingredient=ingredients.find(i=>i.id===line.ingredient_id);
  if(!ingredient)return 'An ingredient is missing. Refresh your inventory.';
  const count=Number(raw);
  if(!Number.isFinite(count)||count<0||count>1000000||Math.abs(Math.round(count*1000)-count*1000)>1e-7||(ingredient.unit==='piece'&&!Number.isInteger(count)))return `Invalid count for ${ingredient.name}.`;
 }
 return null;
}
export function stocktakeChanges(lines:StocktakeLine[],input:Record<string,string>):number{
 return lines.filter(line=>input[line.ingredient_id]?.trim()!==''&&Number(input[line.ingredient_id])!==line.expected_qty).length;
}
