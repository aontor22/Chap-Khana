import {describe,it,expect} from 'vitest';
import {normalizeCouponCode,isCouponCode,couponAmount,localCouponQuote,validateCouponCampaign,type CouponCampaign} from '../src/lib/coupons';
import type {MenuItem} from '../src/types';
const coupon:CouponCampaign={code:'WELCOME10',discount_type:'percent',discount_value:10,min_subtotal:100,max_discount:null,max_uses:50,used_count:0,active:true,starts_at:null,ends_at:null};
const menu=[{id:'chap',name:'Chicken Chap',price:200,discount_type:'percent',discount_value:10,active:true,available:true} as MenuItem];
describe('coupon safety and pricing',()=>{
  it('normalizes and validates coupon codes',()=>{expect(normalizeCouponCode('  welcome10 ')).toBe('WELCOME10');expect(isCouponCode('WELCOME10')).toBe(true);expect(isCouponCode('INVALID CODE')).toBe(false);});
  it('applies coupon to the already discounted dish subtotal',()=>{
    expect(localCouponQuote(coupon,{chap:2},menu,60)).toEqual({code:'WELCOME10',subtotal:360,discount:36,total:384});
  });
  it('enforces cap and non-zero remaining food value',()=>{
    expect(couponAmount({...coupon,discount_type:'fixed',discount_value:500},120)).toBe(119);
    expect(couponAmount({...coupon,max_discount:20},360)).toBe(20);
  });
  it('blocks an expired campaign and its usage cap',()=>{
    expect(()=>localCouponQuote({...coupon,ends_at:'2020-01-01T00:00:00Z'},{chap:1},menu,0)).toThrow();
    expect(()=>localCouponQuote({...coupon,used_count:50},{chap:1},menu,0)).toThrow();
  });
  it('rejects invalid percentage and impossible dates',()=>{
    expect(validateCouponCampaign({...coupon,discount_value:101})).not.toBeNull();
    expect(validateCouponCampaign({...coupon,starts_at:'2026-12-31T00:00:00Z',ends_at:'2026-01-01T00:00:00Z'})).not.toBeNull();
  });
  it('rejects unavailable menu items and small basket',()=>{
    expect(()=>localCouponQuote(coupon,{chap:1},[{...menu[0],available:false}],0)).toThrow();
    expect(()=>localCouponQuote({...coupon,min_subtotal:400},{chap:1},menu,0)).toThrow();
  });
});
