import { supabase } from '../lib/supabase';
import { EMPTY_PURCHASES, validateSupplier, validatePurchaseLines, validateReceipt, outstanding, type Supplier, type PurchaseDraftLine, type PurchaseSnapshot, type PurchaseBalance, type PurchaseOrder, type PurchaseReceipt, type ReceiptDraftLine, type PurchaseReturn, type PurchasePayment, type ReturnDraftLine, type SupplierPaymentMethod, validateGoodsReturn, getPurchaseBalance, validateSupplierPayment } from '../lib/purchasing';
import { EMPTY_STOCK_CONTROL, type StockControlSnapshot } from '../lib/stockControl';
import { kitchenNext, KITCHEN_ACTIVE_STATUSES, type KitchenOrder } from '../lib/kitchen';
import { EMPTY_INVENTORY, type InventorySnapshot, type Ingredient, type InventoryKind, type RecipeLine } from '../lib/inventory';
import { DEFAULT_LOYALTY_SETTINGS, EMPTY_LOYALTY_ACCOUNT, validateLoyaltySettings, type LoyaltySettings, type LoyaltySnapshot } from '../lib/loyalty';
import { fromStorage, saveStorage } from '../lib/utils';
import { discountedUnitPrice } from '../lib/discount';
import { type CouponCampaign, type CouponQuote, DEFAULT_DEMO_COUPONS, normalizeCouponCode, isCouponCode, localCouponQuote, validateCouponCampaign } from '../lib/coupons';
import { normalizeStoreSettings } from '../lib/storeProfile';
import { ADMIN_ORDER_PAGE_SIZE, dhakaDayBounds, filterDemoOrders, normalizeOrderSearch, paginateOrders, validateOrderFilters, type OrderFilter, type OrderPage } from '../lib/orderManagement';
import { demoMenu, demoSettings } from './demo';
import { demoSalesReport, parseSalesReport, validateReportRange, type SalesReport } from '../lib/salesAnalytics';
import type { Cart, CheckoutInfo, MenuItem, Order, OrderReceipt, OrderStatus, StoreSettings, TrackingResult } from '../types';

const db = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase; };
const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
export const getMenu = async (): Promise<MenuItem[]> => {
  if (!supabase) return fromStorage('ckr_demo_menu_v3',demoMenu);
  const {data,error}=await db().from('menu_items').select('*').order('sort_order'); fail(error);
  const menu=(data||[]) as MenuItem[];
  // Stock availability is computed by a read-only RPC; missing migration 14
  // should not block the earlier public storefront from loading.
  const {data:availability,error:availabilityError}=await db().rpc('menu_inventory_availability');
  if(availabilityError){if(!availabilityError.message.includes('menu_inventory_availability'))console.warn('Inventory availability unavailable',availabilityError.message);return menu;}
  const available=new Map((availability||[]).map((row:{menu_item_id:string;in_stock:boolean})=>([row.menu_item_id,row.in_stock] as const)));
  return menu.map(item=>({...item,in_stock:available.get(item.id)!==false}));
};
export const getSettings = async (): Promise<StoreSettings> => {
  if (!supabase) return normalizeStoreSettings(fromStorage('ckr_demo_settings',demoSettings));
  const {data,error}=await db().from('store_settings').select('*').eq('id',1).single(); fail(error);
  return normalizeStoreSettings(data as Partial<StoreSettings>);
};
export const placeOrder = async (info: CheckoutInfo,cart: Cart,menu: MenuItem[], settings: StoreSettings, requestId: string, couponCode?: string, redeemPoints=0): Promise<OrderReceipt> => {
  const items=Object.entries(cart).filter(([,qty])=>qty>0).map(([id,qty])=>({id,qty}));
  if (supabase) {
    const args={p_request_id:requestId,p_name:info.name.trim(),p_phone:info.phone.replace(/[\s-]/g,''),p_type:info.type,p_address:info.address.trim(),p_notes:info.notes.trim(),p_items:items};
    const {data,error}=redeemPoints>0?await db().rpc('place_order_v4',{...args,p_coupon:couponCode?normalizeCouponCode(couponCode):null,p_redeem_points:redeemPoints}):couponCode?await db().rpc('place_order_v3',{...args,p_coupon:normalizeCouponCode(couponCode)}):await db().rpc('place_order_v2',args);
    fail(error); if (!data || typeof data !== 'object' || !('tracking_token' in data)) throw new Error('Order acknowledgement was not received. Contact the restaurant before trying again.');
    return data as unknown as OrderReceipt;
  }
  if(redeemPoints>0)throw new Error('Loyalty redemption requires a live signed-in account.');
  if(!items.length)throw new Error('Choose at least one available item.');
  for(const line of items){const item=menu.find(x=>x.id===line.id);if(!item?.active||!item.available||item.in_stock===false||!Number.isInteger(item.price)||!item.price||item.price<1)throw new Error('Cart contains a dish with an unconfirmed price. Refresh and try again.');}
  const stamp=new Date().toISOString();const code='DEMO-'+crypto.randomUUID().slice(0,8).toUpperCase();const token=crypto.randomUUID();
  const orderItems=items.map(line=>{const item=menu.find(m=>m.id===line.id)!;const final=discountedUnitPrice(item)!;return {menu_item_id:item.id,item_name:item.name,unit_price:final,original_unit_price:item.price!,discount_unit_amount:item.price!-final,qty:line.qty,line_total:final*line.qty};});
  const subtotal=orderItems.reduce((s,i)=>s+i.line_total,0); const fee=info.type==='delivery'?settings.delivery_fee:0;
  const coupon= couponCode ? await quoteCoupon(couponCode,cart,menu,info.type,fee):null;
  const order: Order={id:crypto.randomUUID(),code,tracking_token:token,customer_name:info.name,customer_phone:info.phone,delivery_address:info.address,notes:info.notes,fulfillment_type:info.type,status:'pending',subtotal,delivery_fee:fee,total:subtotal+fee-(coupon?.discount??0),coupon_code:coupon?.code??null,coupon_discount:coupon?.discount??0,created_at:stamp,order_items:orderItems};
  saveStorage('ckr_demo_orders',[order,...fromStorage<Order[]>('ckr_demo_orders',[])]);
  if(coupon){const list=fromStorage<CouponCampaign[]>('ckr_demo_coupons_v1',DEFAULT_DEMO_COUPONS);
    saveStorage('ckr_demo_coupons_v1',list.map(c=>c.code===coupon.code?{...c,used_count:c.used_count+1}:c));}
  return {code,tracking_token:token,total:order.total,demo:true,coupon_code:coupon?.code??null,coupon_discount:coupon?.discount??0};
};
export const trackOrder = async (token: string): Promise<TrackingResult | null> => {
  if (!supabase) {
    const o=fromStorage<Order[]>('ckr_demo_orders',[]).find(o=>o.tracking_token===token || o.code===token);
    return o?{code:o.code,status:o.status,total:o.total,fulfillment_type:o.fulfillment_type,created_at:o.created_at}:null;
  }
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(token)) return null;
  const {data,error}=await db().rpc('track_order',{p_token:token}); fail(error);
  return (data||null) as TrackingResult | null;
};
export const getMyOrders=async (userId: string):Promise<Order[]> => {
  if (!supabase) return [];
  const {data,error}=await db().from('orders').select('id,code,status,total,fulfillment_type,created_at,tracking_token,order_items(item_name,qty,unit_price,line_total)').eq('customer_user_id',userId).order('created_at',{ascending:false}).limit(50); fail(error);
  return (data||[]) as unknown as Order[];
};
export const isStaff=async (userId:string):Promise<boolean>=>{
  if (!supabase) return true; // Demo panel is prominently labelled, browser-local only.
  const {data,error}=await db().from('admin_users').select('user_id').eq('user_id',userId).maybeSingle();fail(error);return Boolean(data);
};
export const getAdminOrders=async ():Promise<Order[]> =>{
  if (!supabase) return fromStorage('ckr_demo_orders',[]);
  const {data,error}=await db().from('orders').select('*,order_items(*)').order('created_at',{ascending:false}).limit(100);fail(error);return (data||[]) as Order[];
};
// Admin-only reads. Supabase RLS remains the security boundary; UI filters are not authorization.
// Use separate, typed column filters instead of composing raw PostgREST OR expressions.
export const getAdminOrderPage=async (filter:OrderFilter,page:number):Promise<OrderPage>=>{
  const validation=validateOrderFilters(filter);if(validation)throw new Error(validation);
  const safePage=Math.max(1,Math.trunc(page)||1);
  if(!supabase)return paginateOrders(filterDemoOrders(fromStorage<Order[]>('ckr_demo_orders',[]),filter),safePage);
  let query=db().from('orders')
    .select('id,code,customer_name,customer_phone,fulfillment_type,status,total,created_at', {count:'exact'})
    .order('created_at',{ascending:false})
    .range((safePage-1)*ADMIN_ORDER_PAGE_SIZE,safePage*ADMIN_ORDER_PAGE_SIZE-1);
  if(filter.status!=='all')query=query.eq('status',filter.status);
  const search=normalizeOrderSearch(filter.search);
  if(search)query=query.ilike(filter.searchField,`%${search}%`);
  if(filter.fromDate)query=query.gte('created_at',dhakaDayBounds(filter.fromDate)!.start);
  if(filter.toDate)query=query.lt('created_at',dhakaDayBounds(filter.toDate)!.end);
  const {data,error,count}=await query;fail(error);
  return {rows:(data||[]) as Order[],total:count??0};
};
export const getAdminOrderDetail=async(id:string):Promise<Order>=>{
  if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))throw new Error('Invalid order ID.');
  if(!supabase){const order=fromStorage<Order[]>('ckr_demo_orders',[]).find(o=>o.id===id);if(!order)throw new Error('Order not found.');return order;}
  const {data,error}=await db().from('orders').select('*,order_items(*)').eq('id',id).single();fail(error);
  if(!data)throw new Error('Order not found.');return data as Order;
};
// A dedicated minimal-payload kitchen queue avoids losing active work behind
// 100 recent completed orders. The orders and items RLS policies remain the gate.
export const getKitchenQueue=async ():Promise<KitchenOrder[]>=>{
  if(!supabase)return fromStorage<Order[]>('ckr_demo_orders',[])
    .filter(o=>(KITCHEN_ACTIVE_STATUSES as readonly string[]).includes(o.status))
    .sort((a,b)=>a.created_at.localeCompare(b.created_at)).slice(0,100);
  const {data,error}=await db().from('orders')
    .select('id,code,status,fulfillment_type,created_at,updated_at,notes,order_items(item_name,qty)')
    .in('status',[...KITCHEN_ACTIVE_STATUSES])
    .order('created_at',{ascending:true}).limit(100);
  fail(error);
  return (data||[]) as KitchenOrder[];
};
export interface KitchenStatusEvent {id:number;previous_status:string;next_status:string;changed_at:string}
export const getKitchenStatusEvents=async (orderId:string):Promise<KitchenStatusEvent[]>=>{
  if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(orderId))throw new Error('Invalid order ID.');
  if(!supabase)return [];
  const {data,error}=await db().from('order_status_events')
    .select('id,previous_status,next_status,changed_at').eq('order_id',orderId)
    .order('changed_at',{ascending:false}).limit(12);
  fail(error);return (data||[]) as KitchenStatusEvent[];
};
export const advanceKitchenOrder=async (order:KitchenOrder,next:OrderStatus):Promise<void>=>{
  if(kitchenNext(order.status,order.fulfillment_type)!==next)throw new Error('Invalid kitchen status change. Refresh the queue.');
  if(!supabase){const orders=fromStorage<Order[]>('ckr_demo_orders',[]);
    const stored=orders.find(o=>o.id===order.id);
    if(!stored||stored.status!==order.status)throw new Error('Order changed. Refresh the queue.');
    saveStorage('ckr_demo_orders',orders.map(o=>o.id===order.id?{...o,status:next,updated_at:new Date().toISOString()}:o));
    return;
  }
  const {data,error}=await db().rpc('kitchen_advance_order',{
    p_order:order.id,p_expected_status:order.status,p_next_status:next,
  });fail(error);
  if(data!==next)throw new Error('Kitchen status update was not confirmed.');
};
export const changeOrderStatus=async (id:string,status:OrderStatus):Promise<void>=>{
  if (!supabase) {saveStorage('ckr_demo_orders',fromStorage<Order[]>('ckr_demo_orders',[]).map(o=>o.id===id?{...o,status}:o));return;}
  const {data,error}=await db().from('orders').update({status}).eq('id',id).select('id').single();fail(error);if (!data) throw new Error('Order update was not confirmed.');
};
export const saveMenuItem=async (item:MenuItem):Promise<void>=>{
  if (!supabase) {const menu=fromStorage('ckr_demo_menu_v3',demoMenu);saveStorage('ckr_demo_menu_v3',[...menu.filter(x=>x.id!==item.id),item].sort((a,b)=>a.sort_order-b.sort_order));return;}
  const {error}=await db().from('menu_items').upsert(item,{onConflict:'id'});fail(error);
};
export const saveStoreSettings=async (settings:StoreSettings):Promise<void>=>{
  if (!supabase) {saveStorage('ckr_demo_settings',normalizeStoreSettings(settings));return;}
  const {data,error}=await db().from('store_settings').update({accepting_orders:settings.accepting_orders,delivery_enabled:settings.delivery_enabled,pickup_enabled:settings.pickup_enabled,delivery_fee:settings.delivery_fee,contact_phone:settings.contact_phone,whatsapp_phone:settings.whatsapp_phone,address_text:settings.address_text,maps_url:settings.maps_url,facebook_url:settings.facebook_url,instagram_url:settings.instagram_url,hours_note:settings.hours_note,announcement:settings.announcement,dine_in_enabled:settings.dine_in_enabled,weekly_hours:settings.weekly_hours}).eq('id',1).select('id').single();fail(error);if(!data)throw new Error('Store settings update was not confirmed.');
};

// Aggregate reporting only: no PII is returned to this dashboard or CSV exports.
export const getSalesReport=async(from:string,to:string):Promise<SalesReport>=>{
  const validation=validateReportRange(from,to);if(validation)throw new Error(validation);
  if(!supabase)return demoSalesReport(fromStorage<Order[]>('ckr_demo_orders',[]),from,to);
  const {data,error}=await db().rpc('staff_sales_report',{p_from:from,p_to:to});fail(error);
  return parseSalesReport(data,from,to);
};

// Coupon table is never exposed publicly: staff-only RLS applies to all row reads/writes.
// Guest coupon previews use a limited RPC with server-calculated cart prices.
const DEMO_COUPON_KEY='ckr_demo_coupons_v1';
export const getCoupons=async():Promise<CouponCampaign[]>=>{
  if(!supabase)return fromStorage<CouponCampaign[]>(DEMO_COUPON_KEY,DEFAULT_DEMO_COUPONS);
  const {data,error}=await db().from('coupon_campaigns').select('*').order('created_at',{ascending:false});fail(error);
  return (data||[]) as CouponCampaign[];
};
export const saveCouponCampaign=async(campaign:CouponCampaign,existing:boolean):Promise<void>=>{
  const code=normalizeCouponCode(campaign.code);
  const valid=validateCouponCampaign({...campaign,code});if(valid)throw new Error(valid);
  const fields={discount_type:campaign.discount_type,discount_value:campaign.discount_value,min_subtotal:campaign.min_subtotal,
    max_discount:campaign.max_discount,max_uses:campaign.max_uses,starts_at:campaign.starts_at,ends_at:campaign.ends_at,active:campaign.active};
  if(!supabase){const current=fromStorage<CouponCampaign[]>(DEMO_COUPON_KEY,DEFAULT_DEMO_COUPONS);
    if(!existing&&current.some(item=>item.code===code))throw new Error('Coupon code already exists.');
    saveStorage(DEMO_COUPON_KEY,[...current.filter(item=>item.code!==code),{...campaign,...fields,code}]);return;}
  if(existing){const {data,error}=await db().from('coupon_campaigns').update(fields).eq('code',code).select('code').single();fail(error);if(!data)throw new Error('Coupon was not saved.');}
  else{const {error}=await db().from('coupon_campaigns').insert({...fields,code});fail(error);}
};
export const quoteCoupon=async(code:string,cart:Cart,menu:MenuItem[],type:CheckoutInfo['type'],fee:number):Promise<CouponQuote>=>{
  const normalized=normalizeCouponCode(code);
  if(!isCouponCode(normalized))throw new Error('Enter a valid coupon code.');
  const items=Object.entries(cart).filter(([,qty])=>qty>0).map(([id,qty])=>({id,qty}));
  if(!supabase){const campaign=fromStorage<CouponCampaign[]>(DEMO_COUPON_KEY,DEFAULT_DEMO_COUPONS).find(c=>c.code===normalized);
    if(!campaign)throw new Error('Coupon is invalid or unavailable.');
    return localCouponQuote(campaign,cart,menu,fee);}
  const {data,error}=await db().rpc('quote_coupon',{p_code:normalized,p_items:items,p_type:type});fail(error);
  const quote=data as unknown as CouponQuote;
  if(!quote||quote.code!==normalized||!Number.isSafeInteger(quote.discount)||quote.discount<1)throw new Error('Could not validate the coupon.');
  return quote;
};

// Wallet data is read-only for customers. Only private SECURITY DEFINER functions
// can reserve, credit or refund points; no browser-side wallet writes exist.
export const getLoyaltySnapshot=async(userId:string):Promise<LoyaltySnapshot>=>{
  if(!supabase)return {settings:DEFAULT_LOYALTY_SETTINGS,account:EMPTY_LOYALTY_ACCOUNT,events:[]};
  const [settings,wallet,events]=await Promise.all([
    db().from('loyalty_settings').select('*').eq('id',1).single(),
    db().from('loyalty_accounts').select('balance,lifetime_earned,lifetime_redeemed').eq('user_id',userId).maybeSingle(),
    db().from('loyalty_events').select('id,kind,points,created_at,order_id').eq('user_id',userId).order('created_at',{ascending:false}).limit(15)
  ]);
  fail(settings.error);fail(wallet.error);fail(events.error);
  return {settings:settings.data as LoyaltySettings,account:wallet.data??EMPTY_LOYALTY_ACCOUNT,
    events:(events.data||[]) as LoyaltySnapshot['events']};
};
export const getLoyaltySettings=async():Promise<LoyaltySettings>=>{
  if(!supabase)return fromStorage('ckr_demo_loyalty_rules',DEFAULT_LOYALTY_SETTINGS);
  const {data,error}=await db().from('loyalty_settings').select('*').eq('id',1).single();fail(error);
  return data as LoyaltySettings;
};
export const saveLoyaltySettings=async(settings:LoyaltySettings):Promise<void>=>{
  const reason=validateLoyaltySettings(settings);if(reason)throw new Error(reason);
  if(!supabase){saveStorage('ckr_demo_loyalty_rules',settings);return;}
  const {data,error}=await db().from('loyalty_settings').update({
    enabled:settings.enabled,points_per_100_bdt:settings.points_per_100_bdt,
    bdt_per_point:settings.bdt_per_point,minimum_redeem_points:settings.minimum_redeem_points,
    max_redeem_percent:settings.max_redeem_percent,updated_at:new Date().toISOString()
  }).eq('id',1).select('id').single();fail(error);
  if(!data)throw new Error('Rewards settings could not be saved.');
};

// Inventory mutations are done through staff-only PostgreSQL RPCs. Browser users
// can NEVER write on_hand, reservations, or inventory movement records directly.
const DEMO_INV_KEY='ckr_demo_inventory_v315';
export const getInventorySnapshot=async():Promise<InventorySnapshot>=>{
 if(!supabase)return fromStorage(DEMO_INV_KEY,EMPTY_INVENTORY);
 const [settings,ingredients,menuStock,recipes,movements]=await Promise.all([
   db().from('inventory_settings').select('enabled').eq('id',1).single(),
   db().from('inventory_ingredients').select('*').order('name'),
   db().from('inventory_menu_stock').select('*').order('menu_item_id'),
   db().from('inventory_recipes').select('*').order('menu_item_id'),
   db().from('inventory_movements').select('*').order('created_at',{ascending:false}).limit(80)
 ]);
 fail(settings.error);fail(ingredients.error);fail(menuStock.error);fail(recipes.error);fail(movements.error);
 return {enabled:Boolean(settings.data?.enabled),ingredients:(ingredients.data||[]) as Ingredient[],
  menuStock:(menuStock.data||[]) as InventorySnapshot['menuStock'],
  recipes:(recipes.data||[]) as RecipeLine[],movements:(movements.data||[]) as InventorySnapshot['movements']};
};
export const setInventoryEnabled=async(enabled:boolean)=>{
 if(!supabase){const old=fromStorage(DEMO_INV_KEY,EMPTY_INVENTORY);saveStorage(DEMO_INV_KEY,{...old,enabled});return;}
 const {data,error}=await db().from('inventory_settings').update({enabled}).eq('id',1).select('id').single();fail(error);
 if(!data)throw new Error('Inventory settings not saved.');
};
export const createInventoryIngredient=async(input:Pick<Ingredient,'name'|'unit'|'reorder_level'|'tracked'|'active'>)=>{
 if(!supabase){const old=fromStorage(DEMO_INV_KEY,EMPTY_INVENTORY);saveStorage(DEMO_INV_KEY,{...old,ingredients:[...old.ingredients,{...input,id:crypto.randomUUID(),on_hand:0}]});return;}
 const {error}=await db().from('inventory_ingredients').insert(input);fail(error);
};
export const updateInventoryIngredient=async(id:string,fields:Pick<Ingredient,'name'|'reorder_level'|'tracked'|'active'>)=>{
 if(!supabase){const old=fromStorage(DEMO_INV_KEY,EMPTY_INVENTORY);saveStorage(DEMO_INV_KEY,{...old,ingredients:old.ingredients.map(i=>i.id===id?{...i,...fields}:i)});return;}
 const {error}=await db().from('inventory_ingredients').update(fields).eq('id',id);fail(error);
};
export const configureMenuStock=async(id:string,tracked:boolean,threshold:number)=>{
 if(!supabase){const old=fromStorage(DEMO_INV_KEY,EMPTY_INVENTORY);saveStorage(DEMO_INV_KEY,{...old,menuStock:[...old.menuStock.filter(m=>m.menu_item_id!==id),{menu_item_id:id,tracked,on_hand:old.menuStock.find(m=>m.menu_item_id===id)?.on_hand??0,reorder_level:threshold}]});return;}
 const {error}=await db().rpc('inventory_configure_menu',{p_item:id,p_tracked:tracked,p_reorder:threshold});fail(error);
};
export const replaceInventoryRecipe=async(id:string,lines:Array<Pick<RecipeLine,'ingredient_id'|'quantity_per_item'>>)=>{
 if(!supabase){const old=fromStorage(DEMO_INV_KEY,EMPTY_INVENTORY);saveStorage(DEMO_INV_KEY,{...old,recipes:[...old.recipes.filter(r=>r.menu_item_id!==id),...lines.map(l=>({...l,menu_item_id:id}))]});return;}
 const {error}=await db().rpc('inventory_set_recipe',{p_item:id,p_lines:lines});fail(error);
};
export const adjustInventoryStock=async(kind:InventoryKind,id:string,delta:number,reason:string)=>{
 if(!supabase){const old=fromStorage(DEMO_INV_KEY,EMPTY_INVENTORY);if(kind==='ingredient'){const target=old.ingredients.find(i=>i.id===id);if(!target||target.on_hand+delta<0)throw new Error('Insufficient stock.');saveStorage(DEMO_INV_KEY,{...old,ingredients:old.ingredients.map(i=>i.id===id?{...i,on_hand:i.on_hand+delta}:i)});}else{const target=old.menuStock.find(i=>i.menu_item_id===id);if(!target||target.on_hand+delta<0)throw new Error('Insufficient stock.');saveStorage(DEMO_INV_KEY,{...old,menuStock:old.menuStock.map(i=>i.menu_item_id===id?{...i,on_hand:i.on_hand+delta}:i)});}return;}
 const {error}=await db().rpc('inventory_adjust_stock',{p_kind:kind,p_id:id,p_delta:delta,p_reason:reason});fail(error);
};

// v3.18 stock-control: read-only staff lot/count snapshots; every mutation is a protected RPC.
export const getStockControlSnapshot=async():Promise<StockControlSnapshot>=>{
 if(!supabase)return EMPTY_STOCK_CONTROL;
 const [lots,drafts,posted]=await Promise.all([
  db().from('inventory_expiry_lots').select('*').order('created_at',{ascending:false}).limit(500),
  db().from('inventory_stocktakes').select('id,status,notes,created_at,posted_at').eq('status','draft').order('created_at',{ascending:false}).limit(1),
  db().from('inventory_stocktakes').select('id,status,notes,created_at,posted_at').eq('status','posted').order('created_at',{ascending:false}).limit(9)
 ]);
 fail(lots.error);fail(drafts.error);fail(posted.error);
 const draft=(drafts.data||[])[0];
 let lines:StockControlSnapshot['lines']=[];
 if(draft){const response=await db().from('inventory_stocktake_lines').select('stocktake_id,ingredient_id,expected_qty,counted_qty').eq('stocktake_id',draft.id).limit(200);
  fail(response.error);lines=(response.data||[]) as StockControlSnapshot['lines'];}
 return {available:true,lots:(lots.data||[]) as StockControlSnapshot['lots'],
  stocktakes:[...(drafts.data||[]),...(posted.data||[])] as StockControlSnapshot['stocktakes'],lines};
};
export const tagInventoryLot=async(lot:string,batch:string,expiry:string|null):Promise<void>=>{
 const {error}=await db().rpc('inventory_tag_lot',{p_lot:lot,p_batch:batch,p_expiry:expiry});fail(error);
};
export const splitInventoryLot=async(lot:string,quantity:number,batch:string,expiry:string|null):Promise<void>=>{
 const {error}=await db().rpc('inventory_split_lot',{p_lot:lot,p_qty:quantity,p_batch:batch,p_expiry:expiry});fail(error);
};
export const recordInventoryWaste=async(kind:InventoryKind,id:string,quantity:number,reason:string,lot:string|null,request:string):Promise<void>=>{
 const {error}=await db().rpc('inventory_record_waste',{p_kind:kind,p_id:id,p_qty:quantity,p_reason:reason,p_lot:lot,p_request:request});fail(error);
};
export const startInventoryStocktake=async(notes:string):Promise<string>=>{
 const {data,error}=await db().rpc('inventory_start_stocktake',{p_notes:notes});fail(error);return String(data);
};
export const postInventoryStocktake=async(id:string,counts:Array<{ingredient_id:string;counted:number}>):Promise<void>=>{
 const {error}=await db().rpc('inventory_post_stocktake',{p_stocktake:id,p_counts:counts});fail(error);
};

// Supplier purchasing: staff-only Postgres rows and SECURITY DEFINER RPCs.
// Goods receiving is atomic with inventory movements, and request IDs are idempotent.
const PURCHASE_DEMO_KEY='ckr_demo_purchase_v316';
const demoPurchaseSnapshot=():PurchaseSnapshot=>({...EMPTY_PURCHASES,...fromStorage<Partial<PurchaseSnapshot>>(PURCHASE_DEMO_KEY,EMPTY_PURCHASES),financeAvailable:true,
  returns:fromStorage<Partial<PurchaseSnapshot>>(PURCHASE_DEMO_KEY,EMPTY_PURCHASES).returns||[],
  payments:fromStorage<Partial<PurchaseSnapshot>>(PURCHASE_DEMO_KEY,EMPTY_PURCHASES).payments||[]});
const missingFinanceMigration=(error:{code?:string;message?:string}|null)=>
  Boolean(error&&(['42P01','PGRST202','PGRST205'].includes(error.code||'')||/could not find.*purchase_(financial_summary|returns|payments)/i.test(error.message||'')));

export const getPurchasingSnapshot=async():Promise<PurchaseSnapshot>=>{
 if(!supabase){const snap=demoPurchaseSnapshot();return {...snap,balances:snap.orders.map(o=>getPurchaseBalance(o.id,snap.receipts,snap.returns,snap.payments))};}
 const [suppliers,orders,receipts]=await Promise.all([
   db().from('purchase_suppliers').select('*').order('name'),
   db().from('purchase_orders').select('*,purchase_order_lines(*)').order('created_at',{ascending:false}).limit(50),
   db().from('purchase_receipts').select('*,purchase_receipt_lines(*)').order('received_at',{ascending:false}).limit(50)
 ]);
 fail(suppliers.error);fail(orders.error);fail(receipts.error);
 const [returns,payments,balances]=await Promise.all([
   db().from('purchase_returns').select('id,order_id,receipt_id,request_id,reason,created_at,purchase_return_lines(*)').order('created_at',{ascending:false}).limit(100),
   db().from('purchase_payments').select('*').order('created_at',{ascending:false}).limit(100),
   db().rpc('purchase_financial_summary',{p_order_ids:(orders.data||[]).map(o=>o.id).length?(orders.data||[]).map(o=>o.id):[ '00000000-0000-0000-0000-000000000000' ]})
 ]);
 const financeErrors=[returns.error,payments.error,balances.error];
 const unavailable=financeErrors.some(missingFinanceMigration);
 if(!unavailable)for(const e of financeErrors)fail(e);
 return {suppliers:(suppliers.data||[]) as Supplier[],orders:(orders.data||[]) as PurchaseOrder[],receipts:(receipts.data||[]) as PurchaseReceipt[],
   returns:unavailable?[]:(returns.data||[]) as PurchaseReturn[],payments:unavailable?[]:(payments.data||[]) as PurchasePayment[],
   balances:unavailable?[]:(balances.data||[]) as PurchaseBalance[],financeAvailable:!unavailable};
};
export const savePurchaseSupplier=async(input:Supplier,existing:boolean):Promise<void>=>{
 const problem=validateSupplier(input);if(problem)throw new Error(problem);
 const data={name:input.name.trim(),phone:input.phone.trim(),email:input.email.trim(),notes:input.notes.trim(),active:input.active};
 if(!supabase){const snap=fromStorage(PURCHASE_DEMO_KEY,EMPTY_PURCHASES);const newItem={...data,id:existing?input.id:crypto.randomUUID()};saveStorage(PURCHASE_DEMO_KEY,{...snap,suppliers:existing?snap.suppliers.map(s=>s.id===input.id?{...s,...newItem}:s):[newItem,...snap.suppliers]});return;}
 if(existing){const {error}=await db().from('purchase_suppliers').update(data).eq('id',input.id);fail(error);}
 else {const {error}=await db().from('purchase_suppliers').insert(data);fail(error);}
};
export const createPurchaseOrder=async(supplier:string,notes:string,lines:PurchaseDraftLine[],units:Map<string,string>):Promise<string>=>{
 const problem=validatePurchaseLines(lines,units);if(problem)throw new Error(problem);
 if(!supplier)throw new Error('Choose a supplier.');
 if(notes.length>500)throw new Error('Notes too long.');
 if(!supabase){const snap=fromStorage(PURCHASE_DEMO_KEY,EMPTY_PURCHASES);const id=crypto.randomUUID();const now=new Date().toISOString();
  const order:PurchaseOrder={id,supplier_id:supplier,status:'draft',notes,created_at:now,purchase_order_lines:lines.map(l=>({...l,id:crypto.randomUUID(),order_id:id,received_qty:0}))};
  saveStorage(PURCHASE_DEMO_KEY,{...snap,orders:[order,...snap.orders]});return id;}
 const {data,error}=await db().rpc('purchase_create_order',{p_supplier:supplier,p_notes:notes,p_lines:lines});fail(error);
 if(typeof data!=='string')throw new Error('Purchase order ID was not returned.');return data;
};
export const updatePurchaseOrderStatus=async(id:string,status:'ordered'|'cancelled'):Promise<void>=>{
 if(!supabase){const snap=fromStorage(PURCHASE_DEMO_KEY,EMPTY_PURCHASES);const o=snap.orders.find(x=>x.id===id);if(!o||!(o.status==='draft'&&['ordered','cancelled'].includes(status)||o.status==='ordered'&&status==='cancelled'))throw new Error('Invalid purchase status change.');
  saveStorage(PURCHASE_DEMO_KEY,{...snap,orders:snap.orders.map(x=>x.id===id?{...x,status}:x)});return;}
 const {error}=await db().rpc('purchase_change_status',{p_order:id,p_status:status});fail(error);
};
export const receivePurchaseOrder=async(order:PurchaseOrder,requestId:string,lines:ReceiptDraftLine[],units:Map<string,string>):Promise<void>=>{
 const problem=validateReceipt(lines,order,units);if(problem)throw new Error(problem);
 if(!supabase){const snap=fromStorage(PURCHASE_DEMO_KEY,EMPTY_PURCHASES);
  const prev=snap.receipts.find(r=>r.request_id===requestId);if(prev){if(prev.order_id===order.id)return;throw new Error('Receipt request already used.');}
  const current=snap.orders.find(o=>o.id===order.id);if(!current||!['ordered','partially_received'].includes(current.status))throw new Error('Order is not receivable.');
  const check=validateReceipt(lines,current,units);if(check)throw new Error(check);
  const edited=current.purchase_order_lines.map(l=>({...l,received_qty:l.received_qty+(lines.find(x=>x.line_id===l.id)?.quantity||0)}));
  const newStatus=edited.every(l=>outstanding(l)===0)?'received':'partially_received';const receiptId=crypto.randomUUID();
  const receipt:PurchaseReceipt={id:receiptId,order_id:order.id,request_id:requestId,received_at:new Date().toISOString(),purchase_receipt_lines:lines.map(x=>({receipt_id:receiptId,order_line_id:x.line_id,quantity:x.quantity,unit_cost_snapshot:current.purchase_order_lines.find(l=>l.id===x.line_id)!.unit_cost}))};
  // Demo mode persists both purchasing and ingredient stock in this browser only.
  const inv=fromStorage(DEMO_INV_KEY,EMPTY_INVENTORY);
  const quantities=new Map<string,number>();for(const x of lines){const ing=current.purchase_order_lines.find(l=>l.id===x.line_id)!.ingredient_id;quantities.set(ing,(quantities.get(ing)||0)+x.quantity);}
  saveStorage(DEMO_INV_KEY,{...inv,ingredients:inv.ingredients.map(i=>({...i,on_hand:i.on_hand+(quantities.get(i.id)||0)}))});
  saveStorage(PURCHASE_DEMO_KEY,{...snap,orders:snap.orders.map(o=>o.id===order.id?{...o,status:newStatus,purchase_order_lines:edited}:o),receipts:[receipt,...snap.receipts]});return;
 }
 const {error}=await db().rpc('purchase_receive',{p_order:order.id,p_request:requestId,p_lines:lines});fail(error);
};

// Additive v3.17 procurement ledger. One UUID per user action is reused on network retry.
export const returnPurchaseGoods=async(receipt:PurchaseReceipt,order:PurchaseOrder,requestId:string,
  reason:string,lines:ReturnDraftLine[],units:Map<string,string>):Promise<void>=>{
 if(!reason.trim()||reason.trim().length<3||reason.trim().length>300)throw new Error('A return reason of 3–300 characters is required.');
 if(supabase){
  const {error}=await db().rpc('purchase_return_goods',{p_receipt:receipt.id,p_request:requestId,p_reason:reason.trim(),p_lines:lines});fail(error);return;
 }
 if(!supabase){
  const current=demoPurchaseSnapshot();const old=current.returns.find(r=>r.request_id===requestId);
  if(old){if(old.receipt_id===receipt.id&&old.reason===reason.trim()&&JSON.stringify(old.purchase_return_lines.map(l=>({order_line_id:l.order_line_id,quantity:l.quantity})))===JSON.stringify(lines))return;throw new Error('Return request ID already used.');}
  const before=current.orders.find(o=>o.id===order.id);if(!before)throw new Error('Purchase order is missing.');
  const checked=validateGoodsReturn(receipt,lines,current.returns,units,before);if(checked)throw new Error(checked);
  const inv=fromStorage(DEMO_INV_KEY,EMPTY_INVENTORY);const deltas=new Map<string,number>();
  for(const line of lines){const poLine=before.purchase_order_lines.find(x=>x.id===line.order_line_id)!;
   deltas.set(poLine.ingredient_id,(deltas.get(poLine.ingredient_id)||0)+line.quantity);}
  for(const [id,qty] of deltas){const ing=inv.ingredients.find(i=>i.id===id);if(!ing||ing.on_hand<qty)throw new Error('Insufficient on-hand stock for supplier return.');}
  const ret:PurchaseReturn={id:crypto.randomUUID(),order_id:order.id,receipt_id:receipt.id,request_id:requestId,reason:reason.trim(),created_at:new Date().toISOString(),
   purchase_return_lines:lines.map(line=>({...line,receipt_id:receipt.id,unit_cost_snapshot:receipt.purchase_receipt_lines.find(r=>r.order_line_id===line.order_line_id)!.unit_cost_snapshot}))};
  saveStorage(DEMO_INV_KEY,{...inv,ingredients:inv.ingredients.map(i=>({...i,on_hand:i.on_hand-(deltas.get(i.id)||0)}))});
  saveStorage(PURCHASE_DEMO_KEY,{...current,returns:[ret,...current.returns]});return;
 }
};
export const recordSupplierPayment=async(orderId:string,requestId:string,amount:number,
  method:SupplierPaymentMethod,reference:string,notes:string,paidOn:string):Promise<void>=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)||paidOn>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'}))throw new Error('Payment date must not be in the future.');
 if(supabase){const {error}=await db().rpc('purchase_record_payment',{p_order:orderId,p_request:requestId,p_amount:amount,p_method:method,p_reference:reference,p_notes:notes,p_paid_on:paidOn});fail(error);return;}
 if(!supabase){const current=demoPurchaseSnapshot();const old=current.payments.find(x=>x.request_id===requestId);
  if(old){if(old.order_id===orderId&&old.amount===amount&&old.payment_method===method&&old.reference===reference&&old.notes===notes&&old.paid_on===paidOn)return;throw new Error('Payment request ID already used.');}
  const nowBalance=getPurchaseBalance(orderId,current.receipts,current.returns,current.payments);
  const check=validateSupplierPayment(amount,method,reference,notes,nowBalance.outstanding_value);if(check)throw new Error(check);
  saveStorage(PURCHASE_DEMO_KEY,{...current,payments:[{id:crypto.randomUUID(),order_id:orderId,request_id:requestId,amount,payment_method:method,reference,notes,paid_on:paidOn,created_at:new Date().toISOString()},...current.payments]});return;
 }
};
