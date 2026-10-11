import type { Fulfillment, OrderReceipt } from '../types';

// Confirmation data is scoped to the browser tab. Never save phone/address here.
// A tracking token is a private bearer credential: do not persist it in localStorage.
const KEY='ckr_recent_receipt_v1';
export const RECEIPT_TTL_MS=24*60*60*1000;
export type ReceiptLine={name:string;qty:number};
export type SavedReceipt={code:string;tracking_token:string;total:number;demo:boolean;type:Fulfillment;lines:ReceiptLine[];savedAt:number;coupon_code?:string|null;coupon_discount?:number;loyalty_points_redeemed?:number;loyalty_discount?:number};
const isUuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export function validSavedReceipt(value:unknown,now=Date.now()):value is SavedReceipt{
  if(!value||typeof value!=='object')return false;
  const r=value as Partial<SavedReceipt>;
  return typeof r.code==='string'&&r.code.length>0&&r.code.length<=64&&isUuid(r.tracking_token)
    &&typeof r.total==='number'&&Number.isFinite(r.total)&&r.total>=0
    &&(r.coupon_discount===undefined||(typeof r.coupon_discount==='number'&&Number.isSafeInteger(r.coupon_discount)&&r.coupon_discount>=0))
    &&(r.loyalty_points_redeemed===undefined||(Number.isSafeInteger(r.loyalty_points_redeemed)&&r.loyalty_points_redeemed>=0))
    &&(r.loyalty_discount===undefined||(Number.isSafeInteger(r.loyalty_discount)&&r.loyalty_discount>=0))
    &&typeof r.demo==='boolean'&&(r.type==='pickup'||r.type==='delivery')
    &&typeof r.savedAt==='number'&&r.savedAt<=now&&now-r.savedAt<RECEIPT_TTL_MS
    &&Array.isArray(r.lines)&&r.lines.length<=25&&r.lines.every(line=>
      Boolean(line)&&typeof line.name==='string'&&line.name.length>0&&line.name.length<=120
      &&Number.isInteger(line.qty)&&line.qty>=1&&line.qty<=20);
}
export function saveReceipt(order:OrderReceipt,type:Fulfillment,lines:ReceiptLine[]):SavedReceipt{
  const receipt:SavedReceipt={code:order.code,tracking_token:order.tracking_token,total:order.total,
    demo:Boolean(order.demo),type,lines:lines.slice(0,25),savedAt:Date.now(),coupon_code:order.coupon_code??null,coupon_discount:order.coupon_discount??0,loyalty_points_redeemed:order.loyalty_points_redeemed??0,loyalty_discount:order.loyalty_discount??0};
  if(!validSavedReceipt(receipt))throw new Error('Invalid order confirmation returned. Please contact the restaurant.');
  try{sessionStorage.setItem(KEY,JSON.stringify(receipt));}catch{/* session storage disabled; current tab navigation state remains available */}
  return receipt;
}
export function loadReceipt(now=Date.now()):SavedReceipt|null{
  try {const saved=sessionStorage.getItem(KEY);if(!saved)return null;const parsed:unknown=JSON.parse(saved);
    if(validSavedReceipt(parsed,now))return parsed;
    sessionStorage.removeItem(KEY);
  }catch{/* session storage disabled or tampered */}
  return null;
}
export const privateTrackingPath=(token:string)=>`/track?token=${encodeURIComponent(token)}`;
