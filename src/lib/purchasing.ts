export interface Supplier {id:string;name:string;phone:string;email:string;notes:string;active:boolean;created_at?:string}
export type PurchaseStatus = 'draft'|'ordered'|'partially_received'|'received'|'cancelled';
export interface PurchaseLine {id:string;order_id:string;ingredient_id:string;quantity:number;received_qty:number;unit_cost:number}
export interface PurchaseOrder {id:string;supplier_id:string;status:PurchaseStatus;notes:string;created_at:string;updated_at?:string;purchase_order_lines:PurchaseLine[]}
export interface PurchaseReceiptLine {receipt_id:string;order_line_id:string;quantity:number;unit_cost_snapshot:number}
export interface PurchaseReceipt {id:string;order_id:string;request_id:string;received_at:string;purchase_receipt_lines:PurchaseReceiptLine[]}
export interface PurchaseReturnLine {receipt_id:string;order_line_id:string;quantity:number;unit_cost_snapshot:number}
export interface PurchaseReturn {id:string;order_id:string;receipt_id:string;request_id:string;reason:string;created_at:string;purchase_return_lines:PurchaseReturnLine[]}
export type SupplierPaymentMethod='cash'|'bank'|'bkash'|'nagad'|'other';
export interface PurchasePayment {id:string;order_id:string;request_id:string;amount:number;payment_method:SupplierPaymentMethod;reference:string;notes:string;paid_on:string;created_at:string}
export interface PurchaseBalance {order_id:string;received_value:number;returned_value:number;paid_value:number;outstanding_value:number;supplier_credit:number}
export interface PurchaseSnapshot {suppliers:Supplier[];orders:PurchaseOrder[];receipts:PurchaseReceipt[];returns:PurchaseReturn[];payments:PurchasePayment[];balances:PurchaseBalance[];financeAvailable:boolean}
export interface ReturnDraftLine {order_line_id:string;quantity:number} 

export const EMPTY_PURCHASES:PurchaseSnapshot={suppliers:[],orders:[],receipts:[],returns:[],payments:[],balances:[],financeAvailable:true};
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

export const SUPPLIER_PAYMENT_METHODS:SupplierPaymentMethod[]=['cash','bank','bkash','nagad','other'];
export function remainingReturnQuantity(line:PurchaseReceiptLine,returns:PurchaseReturn[]):number {
 const already=returns.filter(r=>r.receipt_id===line.receipt_id).flatMap(r=>r.purchase_return_lines)
 .filter(r=>r.order_line_id===line.order_line_id).reduce((sum,r)=>sum+r.quantity,0);
 return Math.max(0,Math.round((line.quantity-already)*1000)/1000);
}
export function validateGoodsReturn(receipt:PurchaseReceipt,lines:ReturnDraftLine[],returns:PurchaseReturn[],units:Map<string,string>,po:PurchaseOrder):string|null {
 if(lines.length<1||lines.length>50)return 'Select 1–50 ingredient quantities to return.';
 if(new Set(lines.map(l=>l.order_line_id)).size!==lines.length)return 'Duplicate supplier return line.';
 for(const row of lines){
  const source=receipt.purchase_receipt_lines.find(r=>r.order_line_id===row.order_line_id);
  if(!source)return 'Return line must belong to this receipt.';
  const original=po.purchase_order_lines.find(l=>l.id===row.order_line_id);
  if(!original)return 'Missing purchase ingredient.';
  if(!validPurchaseQuantity(row.quantity,units.get(original.ingredient_id)||''))return 'Invalid supplier return quantity.';
  if(row.quantity>remainingReturnQuantity(source,returns))return 'Return quantity exceeds received goods remaining.';
 }
 return null;
}
export function getPurchaseBalance(orderId:string,receipts:PurchaseReceipt[],returns:PurchaseReturn[],payments:PurchasePayment[]):PurchaseBalance {
 const asCents=(value:number)=>Math.round(value*100);
 const recv=receipts.filter(r=>r.order_id===orderId).flatMap(r=>r.purchase_receipt_lines).reduce((s,l)=>s+asCents(l.quantity*l.unit_cost_snapshot),0);
 const ret=returns.filter(r=>r.order_id===orderId).flatMap(r=>r.purchase_return_lines).reduce((s,l)=>s+asCents(l.quantity*l.unit_cost_snapshot),0);
 const paid=payments.filter(p=>p.order_id===orderId).reduce((s,p)=>s+asCents(p.amount),0);
 return {order_id:orderId,received_value:recv/100,returned_value:ret/100,paid_value:paid/100,outstanding_value:Math.max(0,recv-ret-paid)/100,supplier_credit:Math.max(0,ret+paid-recv)/100};
}
export function validateSupplierPayment(amount:number,method:string,reference:string,notes:string,outstanding:number):string|null {
 if(!Number.isFinite(amount)||amount<=0||amount>10000000||Math.abs(Math.round(amount*100)-amount*100)>1e-7)return 'Enter a valid payment amount in BDT.';
 if(amount>outstanding+0.00001)return 'Payment exceeds outstanding received goods value.';
 if(!SUPPLIER_PAYMENT_METHODS.includes(method as SupplierPaymentMethod))return 'Select a valid payment method.';
 if(reference.length>120||notes.length>300)return 'Payment reference or notes are too long.';
 return null;
}
