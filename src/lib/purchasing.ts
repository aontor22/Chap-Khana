export interface Supplier {id:string;name:string;phone:string;email:string;notes:string;active:boolean;created_at?:string}
export type PurchaseStatus = 'draft'|'ordered'|'partially_received'|'received'|'cancelled';
export interface PurchaseLine {id:string;order_id:string;ingredient_id:string;quantity:number;received_qty:number;unit_cost:number}
export interface PurchaseOrder {id:string;supplier_id:string;status:PurchaseStatus;notes:string;created_at:string;updated_at?:string;purchase_order_lines:PurchaseLine[]}
export interface PurchaseReceiptLine {receipt_id:string;order_line_id:string;quantity:number;unit_cost_snapshot:number}
export interface PurchaseReceipt {id:string;order_id:string;request_id:string;received_at:string;purchase_receipt_lines:PurchaseReceiptLine[]}
export interface PurchaseSnapshot {suppliers:Supplier[];orders:PurchaseOrder[];receipts:PurchaseReceipt[]}
export const EMPTY_PURCHASES:PurchaseSnapshot={suppliers:[],orders:[],receipts:[]};
export interface PurchaseDraftLine {ingredient_id:string;quantity:number;unit_cost:number}
export interface ReceiptDraftLine {line_id:string;quantity:number}
const MONEY_LIMIT=10000000;
export function validPurchaseQuantity(value:number,unit:string){return Number.isFinite(value)&&value>0&&value<=1000000&&Math.abs(Math.round(value*1000)-value*1000)<1e-7&&(unit!=='piece'||Number.isInteger(value));}
export function validUnitCost(cost:number){return Number.isFinite(cost)&&cost>=0&&cost<=MONEY_LIMIT&&Math.abs(Math.round(cost*100)-cost*100)<1e-7;}
export function validateSupplier(input:Pick<Supplier,'name'|'phone'|'email'|'notes'>):string|null {
 if(input.name.trim().length<2||input.name.trim().length>120)return 'Supplier name must have 2–120 characters.';
 if(input.phone.length>40||input.email.length>200||input.notes.length>500)return 'Supplier contact or notes are too long.';
 if(input.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))return 'Enter a valid supplier email or leave it blank.';
 return null;
}
export function validatePurchaseLines(lines:PurchaseDraftLine[],units:Map<string,string>):string|null {
 if(lines.length<1||lines.length>50)return 'Choose 1–50 ingredient lines.';
 if(new Set(lines.map(l=>l.ingredient_id)).size!==lines.length)return 'Each ingredient can appear only once.';
 for(const line of lines){const unit=units.get(line.ingredient_id);if(!unit)return 'Select an active ingredient.';
   if(!validPurchaseQuantity(line.quantity,unit))return `Invalid quantity for ${line.ingredient_id}.`;
   if(!validUnitCost(line.unit_cost))return 'Unit cost must be a valid BDT amount.';}
 return null;
}
export function outstanding(line:PurchaseLine){return Math.max(0,Math.round((line.quantity-line.received_qty)*1000)/1000);}
export function validateReceipt(lines:ReceiptDraftLine[],order:PurchaseOrder,units:Map<string,string>):string|null {
 if(!lines.length)return 'Enter at least one quantity to receive.';
 if(new Set(lines.map(l=>l.line_id)).size!==lines.length)return 'Duplicate receipt line.';
 for(const row of lines){const source=order.purchase_order_lines.find(l=>l.id===row.line_id);if(!source)return 'Unknown purchase line.';
  if(!validPurchaseQuantity(row.quantity,units.get(source.ingredient_id)||''))return 'Invalid receipt quantity.';
  if(row.quantity>outstanding(source))return 'Receipt exceeds the outstanding quantity.';}
 return null;
}
export function purchaseTotal(order:PurchaseOrder){return order.purchase_order_lines.reduce((s,line)=>s+line.quantity*line.unit_cost,0);}
export function receivedCost(order:PurchaseOrder){return order.purchase_order_lines.reduce((s,line)=>s+line.received_qty*line.unit_cost,0);}
