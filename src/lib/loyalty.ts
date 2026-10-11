/** Display/preview rules only. PostgreSQL is the authority for actual wallet debits. */
export interface LoyaltySettings {
  id: number;
  enabled: boolean;
  points_per_100_bdt: number;
  bdt_per_point: number;
  minimum_redeem_points: number;
  max_redeem_percent: number;
  updated_at?: string;
}
export interface LoyaltyAccount {
  user_id?: string;
  balance: number;
  lifetime_earned: number;
  lifetime_redeemed: number;
}
export interface LoyaltyEvent {id:number;kind:'earn'|'redeem'|'refund';points:number;created_at:string;order_id:string}
export interface LoyaltySnapshot {settings:LoyaltySettings;account:LoyaltyAccount;events:LoyaltyEvent[]}
export const DEFAULT_LOYALTY_SETTINGS:LoyaltySettings={id:1,enabled:false,points_per_100_bdt:1,bdt_per_point:1,minimum_redeem_points:50,max_redeem_percent:20};
export const EMPTY_LOYALTY_ACCOUNT:LoyaltyAccount={balance:0,lifetime_earned:0,lifetime_redeemed:0};
export function validateLoyaltySettings(s:LoyaltySettings):string|null {
  const within=(n:number,a:number,b:number)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
  if(!within(s.points_per_100_bdt,1,50))return 'Earn points per ৳100 must be between 1 and 50.';
  if(!within(s.bdt_per_point,1,10))return 'Taka per point must be between 1 and 10.';
  if(!within(s.minimum_redeem_points,1,100000))return 'Minimum redeem points must be between 1 and 100,000.';
  if(!within(s.max_redeem_percent,1,50))return 'Maximum redeem percentage must be between 1 and 50.';
  return null;
}
export function maxRedeemablePoints(accountBalance:number,eligibleFoodSubtotal:number,s:LoyaltySettings):number {
  if(!s.enabled||!Number.isSafeInteger(accountBalance)||accountBalance<=0||!Number.isSafeInteger(eligibleFoodSubtotal)||eligibleFoodSubtotal<=1)return 0;
  const cap=Math.min(eligibleFoodSubtotal-1,Math.floor(eligibleFoodSubtotal*s.max_redeem_percent/100));
  const points=Math.min(accountBalance,Math.floor(cap/s.bdt_per_point));
  return points>=s.minimum_redeem_points?points:0;
}
export function redemptionPreview(points:number,s:LoyaltySettings):number {
  if(!Number.isSafeInteger(points)||points<0)return 0;
  return points*s.bdt_per_point;
}
export function potentialEarnPoints(foodSubtotalAfterOffers:number,s:LoyaltySettings):number {
  return s.enabled&&foodSubtotalAfterOffers>0?Math.floor(foodSubtotalAfterOffers/100)*s.points_per_100_bdt:0;
}
