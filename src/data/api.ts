import { supabase } from '../lib/supabase';
import { fromStorage, saveStorage } from '../lib/utils';
import { demoMenu, demoSettings } from './demo';
import type { Cart, CheckoutInfo, MenuItem, Order, OrderReceipt, OrderStatus, StoreSettings, TrackingResult } from '../types';

const db = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase; };
const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
export const getMenu = async (): Promise<MenuItem[]> => {
  if (!supabase) return fromStorage('ckr_demo_menu',demoMenu);
  const {data,error}=await db().from('menu_items').select('*').order('sort_order'); fail(error);
  return (data || []) as MenuItem[];
};
export const getSettings = async (): Promise<StoreSettings> => {
  if (!supabase) return fromStorage('ckr_demo_settings',demoSettings);
  const {data,error}=await db().from('store_settings').select('*').eq('id',1).single(); fail(error);
  return data as StoreSettings;
};
export const placeOrder = async (info: CheckoutInfo,cart: Cart,menu: MenuItem[], settings: StoreSettings, requestId: string): Promise<OrderReceipt> => {
  const items=Object.entries(cart).filter(([,qty])=>qty>0).map(([id,qty])=>({id,qty}));
  if (supabase) {
    const {data,error}=await db().rpc('place_order_v2',{p_request_id:requestId,p_name:info.name.trim(),p_phone:info.phone.replace(/[\s-]/g,''),p_type:info.type,p_address:info.address.trim(),p_notes:info.notes.trim(),p_items:items});
    fail(error); if (!data || typeof data !== 'object' || !('tracking_token' in data)) throw new Error('Order acknowledgement was not received. Contact the restaurant before trying again.');
    return data as unknown as OrderReceipt;
  }
  const stamp=new Date().toISOString();const code='DEMO-'+crypto.randomUUID().slice(0,8).toUpperCase();const token=crypto.randomUUID();
  const orderItems=items.map(line=>{const item=menu.find(m=>m.id===line.id)!;return {menu_item_id:item.id,item_name:item.name,unit_price:item.price!,qty:line.qty,line_total:item.price!*line.qty};});
  const subtotal=orderItems.reduce((s,i)=>s+i.line_total,0); const fee=info.type==='delivery'?settings.delivery_fee:0;
  const order: Order={id:crypto.randomUUID(),code,tracking_token:token,customer_name:info.name,customer_phone:info.phone,delivery_address:info.address,notes:info.notes,fulfillment_type:info.type,status:'pending',subtotal,delivery_fee:fee,total:subtotal+fee,created_at:stamp,order_items:orderItems};
  saveStorage('ckr_demo_orders',[order,...fromStorage<Order[]>('ckr_demo_orders',[])]);
  return {code,tracking_token:token,total:order.total,demo:true};
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
export const changeOrderStatus=async (id:string,status:OrderStatus):Promise<void>=>{
  if (!supabase) {saveStorage('ckr_demo_orders',fromStorage<Order[]>('ckr_demo_orders',[]).map(o=>o.id===id?{...o,status}:o));return;}
  const {data,error}=await db().from('orders').update({status}).eq('id',id).select('id').single();fail(error);if (!data) throw new Error('Order update was not confirmed.');
};
export const saveMenuItem=async (item:MenuItem):Promise<void>=>{
  if (!supabase) {const menu=fromStorage('ckr_demo_menu',demoMenu);saveStorage('ckr_demo_menu',[...menu.filter(x=>x.id!==item.id),item].sort((a,b)=>a.sort_order-b.sort_order));return;}
  const {error}=await db().from('menu_items').upsert(item,{onConflict:'id'});fail(error);
};
export const saveStoreSettings=async (settings:StoreSettings):Promise<void>=>{
  if (!supabase) {saveStorage('ckr_demo_settings',settings);return;}
  const {error}=await db().from('store_settings').update({accepting_orders:settings.accepting_orders,delivery_enabled:settings.delivery_enabled,pickup_enabled:settings.pickup_enabled,delivery_fee:settings.delivery_fee}).eq('id',1);fail(error);
};
