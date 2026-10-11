import type { Cart, MenuItem } from '../types';
import { discountedUnitPrice } from './discount';

export type CouponKind='percent'|'fixed';
export interface CouponCampaign {
  code:string; discount_type:CouponKind; discount_value:number;
  min_subtotal:number; max_discount:number|null; max_uses:number|null;
  used_count:number; active:boolean; starts_at:string|null; ends_at:string|null;
}
export interface CouponQuote { code:string; subtotal:number; discount:number; total:number }
export const normalizeCouponCode=(s:string)=>s.trim().toUpperCase();
export const isCouponCode=(code:string)=>/^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(code);
export const DEFAULT_DEMO_COUPONS:CouponCampaign[]=[{
  code:'DEMO10',discount_type:'percent',discount_value:10,min_subtotal:100,
  max_discount:100,max_uses:100,used_count:0,active:true,starts_at:null,ends_at:null
}];
export function validateCouponCampaign(c:CouponCampaign):string|null{
  if(!isCouponCode(c.code))return 'Code must be 3–24 characters: A–Z, digits, underscore or hyphen.';
  if(c.discount_type!=='percent'&&c.discount_type!=='fixed')return 'Choose a discount type.';
  if(!Number.isSafeInteger(c.discount_value)||c.discount_value<1||(c.discount_type==='percent'&&c.discount_value>99))return 'Enter a valid discount value (percentage: 1–99).';
  if(!Number.isSafeInteger(c.min_subtotal)||c.min_subtotal<0||c.min_subtotal>999999)return 'Minimum subtotal is invalid.';
  if(c.max_uses!==null&&(!Number.isSafeInteger(c.max_uses)||c.max_uses<1))return 'Usage limit must be at least 1.';
  if(c.max_discount!==null&&(!Number.isSafeInteger(c.max_discount)||c.max_discount<1))return 'Maximum discount must be positive.';
  if(c.starts_at&&c.ends_at&&new Date(c.ends_at).getTime()<=new Date(c.starts_at).getTime())return 'End time must be after start time.';
  return null;
}
export function couponAmount(c:CouponCampaign,subtotal:number):number{
  if(!Number.isSafeInteger(subtotal)||subtotal<=1)return 0;
  const raw=c.discount_type==='percent'?Math.round(subtotal*c.discount_value/100):c.discount_value;
  return Math.max(0,Math.min(subtotal-1,c.max_discount??Number.MAX_SAFE_INTEGER,raw));
}
export function localCouponQuote(c:CouponCampaign,cart:Cart,menu:MenuItem[],fee:number,now=Date.now()):CouponQuote{
  if(!c.active||(c.starts_at&&new Date(c.starts_at).getTime()>now)||(c.ends_at&&new Date(c.ends_at).getTime()<=now) ||
     (c.max_uses!==null&&c.used_count>=c.max_uses))throw new Error('Coupon is invalid or unavailable.');
  const items=Object.entries(cart).filter(([,qty])=>qty>0);
  if(!items.length||items.length>25)throw new Error('Choose items before applying a coupon.');
  let subtotal=0;
  for(const [id,qty] of items){const dish=menu.find(item=>item.id===id);
    if(!dish?.active||!dish.available||!dish.price||!Number.isInteger(qty)||qty<1||qty>20)throw new Error('Cart contains an invalid item.');
    subtotal+=(discountedUnitPrice(dish)??0)*qty;
  }
  if(subtotal<c.min_subtotal)throw new Error('Minimum basket value not reached.');
  const discount=couponAmount(c,subtotal);
  if(discount<=0)throw new Error('Coupon cannot be applied to this basket.');
  return {code:c.code,subtotal,discount,total:subtotal+fee-discount};
}
