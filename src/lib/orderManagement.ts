import type { Order, OrderStatus } from '../types';

export const ADMIN_ORDER_PAGE_SIZE = 15;
export const ADMIN_ORDER_STATUSES = ['pending','confirmed','preparing','ready','out_for_delivery','completed','cancelled'] as const;
export const ORDER_STATUS_LABELS: Record<OrderStatus,string> = {
  pending:'Pending', confirmed:'Confirmed', preparing:'Preparing', ready:'Ready for pickup',
  out_for_delivery:'Out for delivery', completed:'Completed', cancelled:'Cancelled'
};
export const ORDER_STATUS_NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending:['confirmed','cancelled'], confirmed:['preparing','cancelled'],
  preparing:['ready','out_for_delivery','cancelled'],ready:['out_for_delivery','completed','cancelled'],
  out_for_delivery:['completed','cancelled'],completed:[],cancelled:[]
};
export type OrderSearchField = 'code'|'customer_name'|'customer_phone';
export type OrderFilter = {
  search: string;
  searchField: OrderSearchField;
  status: OrderStatus|'all';
  fromDate: string;
  toDate: string;
};
export type OrderPage = { rows: Order[]; total: number };
export const defaultOrderFilter = ():OrderFilter=>({search:'',searchField:'code',status:'all',fromDate:'',toDate:''});

// Always use restaurant-local calendar dates (UTC+06:00), not the staff device timezone.
const validDay=(s:string)=> /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(`${s}T00:00:00+06:00`));
export function dhakaDayBounds(day:string):{start:string; end:string}|null {
  if (!validDay(day)) return null;
  const ms=Date.parse(`${day}T00:00:00+06:00`);
  if (!Number.isFinite(ms)) return null;
  // Explicit round-trip validation handles invalid dates that JS normalizes.
  const partsList=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));
  const get=(type:string)=>partsList.find(p=>p.type===type)?.value??'';
  const parts=`${get('year')}-${get('month')}-${get('day')}`;
  if (parts !== day) return null;
  return {start:new Date(ms).toISOString(),end:new Date(ms+86400000).toISOString()};
}
export function validateOrderFilters(f:OrderFilter):string|null {
  if (f.search.length>80) return 'Search must be 80 characters or less.';
  if ((f.fromDate && !dhakaDayBounds(f.fromDate))||(f.toDate && !dhakaDayBounds(f.toDate))) return 'Choose valid dates.';
  if (f.fromDate && f.toDate && f.fromDate>f.toDate) return 'From date must be on or before To date.';
  return null;
}
export function normalizeOrderSearch(s:string):string {
  // Prevent %/_ wildcard surprises in PostgREST ilike and excess search load.
  return s.trim().slice(0,80).replace(/[%_\\]/g,'');
}
export function filterDemoOrders(items:readonly Order[],f:OrderFilter):Order[] {
  const text=normalizeOrderSearch(f.search).toLocaleLowerCase();
  const start=f.fromDate?dhakaDayBounds(f.fromDate)?.start:null;
  const end=f.toDate?dhakaDayBounds(f.toDate)?.end:null;
  return [...items].filter(o => {
    if(f.status!=='all'&&o.status!==f.status)return false;
    if(text&&!String(o[f.searchField]||'').toLocaleLowerCase().includes(text))return false;
    if(start&&o.created_at<start)return false;
    if(end&&o.created_at>=end)return false;
    return true;
  }).sort((a,b)=>b.created_at.localeCompare(a.created_at));
}
export function paginateOrders(items:readonly Order[],page:number,size=ADMIN_ORDER_PAGE_SIZE):OrderPage {
  const safePage=Math.max(1,Math.trunc(page)||1);
  return {total:items.length,rows:items.slice((safePage-1)*size,safePage*size)};
}
export function orderDateTime(value:string):string {
  const ms=Date.parse(value);
  return Number.isFinite(ms) ? new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Dhaka',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true
  }).format(new Date(ms))+' (Dhaka)' : 'Date unavailable';
}
