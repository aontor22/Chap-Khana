import {describe, expect, it} from 'vitest';
import { DEFAULT_LOYALTY_SETTINGS, maxRedeemablePoints, redemptionPreview, potentialEarnPoints, validateLoyaltySettings } from '../src/lib/loyalty';
const rules={...DEFAULT_LOYALTY_SETTINGS,enabled:true};
describe('loyalty preview rules (SQL remains authoritative)',()=>{
  it('is disabled by default',()=>expect(maxRedeemablePoints(500,500,DEFAULT_LOYALTY_SETTINGS)).toBe(0));
  it('limits points to wallet balance',()=>expect(maxRedeemablePoints(75,1000,rules)).toBe(75));
  it('caps redemption at twenty percent of eligible basket',()=>expect(maxRedeemablePoints(500,500,rules)).toBe(100));
  it('rejects redemption below minimum threshold',()=>expect(maxRedeemablePoints(40,500,rules)).toBe(0));
  it('excludes coupon-discounted value through eligible-subtotal input',()=>expect(maxRedeemablePoints(500,400,rules)).toBe(80));
  it('uses configured taka-per-point',()=>expect(redemptionPreview(60,{...rules,bdt_per_point:2})).toBe(120));
  it('credits only completed-order eligible value in a preview',()=>expect(potentialEarnPoints(599,{...rules,points_per_100_bdt:3})).toBe(15));
  it('validates unrealistic admin rules',()=>expect(validateLoyaltySettings({...rules,max_redeem_percent:100})).not.toBeNull());
});
