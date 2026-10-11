import type { Order, OrderItem } from '../types';

// Completed order value is NOT a record of settled payments.
export interface SalesDay { day: string; orders: number; completed: number; cancelled: number; order_value: number; savings: number }
export interface SalesDish { name: string; quantity: number; order_value: number; savings: number }
export interface SalesTotals { orders: number; completed: number; cancelled: number; active: number; order_value: number; item_value: number; delivery_fees: number; savings: number; units: number }
export interface SalesReport { from: string; to: string; timezone: 'Asia/Dhaka'; totals: SalesTotals; daily: SalesDay[]; dishes: SalesDish[]; demo?: boolean }
export interface SalesMonth { month: string; orders: number; completed: number; cancelled: number; order_value: number; savings: number }

const EMPTY_TOTALS:SalesTotals={orders:0,completed:0,cancelled:0,active:0,order_value:0,item_value:0,delivery_fees:0,savings:0,units:0};
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
export const isISODate=(value:string):boolean=>{
  if(!datePattern.test(value))return false;
  const [y,m,d]=value.split('-').map(Number);
  if(y<2020||y>2100)return false;
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
};
export const dateOrdinal=(value:string):number=>Math.floor(Date.parse(`${value}T00:00:00Z`)/86400000);
export const validateReportRange=(from:string,to:string):string|null=>{
  if(!isISODate(from)||!isISODate(to))return 'Enter valid start and end dates.';
  const days=dateOrdinal(to)-dateOrdinal(from);
  if(days<0)return 'End date must not precede start date.';
  if(days>365)return 'Select a date range of up to 366 days.';
  return null;
};
export const dhakaDate=(timestamp:string):string=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp));
export const currentDhakaDate=()=>dhakaDate(new Date().toISOString());
export const shiftISODate=(day:string,offset:number):string=>{
  const iso=new Date((dateOrdinal(day)+offset)*86400000).toISOString();
  return iso.slice(0,10);
};
export const monthStart=(day:string)=>day.slice(0,7)+'-01';

export const monthRollup=(rows:SalesDay[]):SalesMonth[]=>{
  const months=new Map<string,SalesMonth>();
  for(const day of rows){
    const month=day.day.slice(0,7);const prev=months.get(month)??{month,orders:0,completed:0,cancelled:0,order_value:0,savings:0};
    prev.orders+=day.orders;prev.completed+=day.completed;prev.cancelled+=day.cancelled;
    prev.order_value+=day.order_value;prev.savings+=day.savings;months.set(month,prev);
  }
  return [...months.values()].sort((a,b)=>a.month.localeCompare(b.month));
};

const asInt=(n:unknown):number=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.round(n)):0;
const validDay=(d:unknown):d is string=>typeof d==='string'&&isISODate(d);
// Runtime validation for a SECURITY DEFINER RPC response; avoid trusting arbitrary JSON shapes.
export function parseSalesReport(value:unknown,from:string,to:string):SalesReport{
  if(!value||typeof value!=='object')throw new Error('Invalid analytics response.');
  const data=value as Record<string,unknown>;
  if(data.from!==from||data.to!==to||data.timezone!=='Asia/Dhaka'||!data.totals||typeof data.totals!=='object'||!Array.isArray(data.daily)||!Array.isArray(data.dishes))throw new Error('Analytics response did not match the selected period.');
  const raw=data.totals as Record<string,unknown>;
  const totals={...EMPTY_TOTALS};
  for(const key of Object.keys(totals) as (keyof SalesTotals)[])totals[key]=asInt(raw[key]);
  const daily=data.daily.map((row:unknown)=>{
    if(!row||typeof row!=='object')throw new Error('Invalid daily sales data.');
    const d=row as Record<string,unknown>;
    if(!validDay(d.day)||d.day<from||d.day>to)throw new Error('Invalid report day.');
    return {day:d.day as string,orders:asInt(d.orders),completed:asInt(d.completed),cancelled:asInt(d.cancelled),order_value:asInt(d.order_value),savings:asInt(d.savings)};
  });
  const dishes=data.dishes.map((row:unknown)=>{
    if(!row||typeof row!=='object')throw new Error('Invalid dish statistics.');
    const d=row as Record<string,unknown>;
    return {name:String(d.name??'').slice(0,120),quantity:asInt(d.quantity),order_value:asInt(d.order_value),savings:asInt(d.savings)};
  });
  return {from,to,timezone:'Asia/Dhaka',totals,daily,dishes};
}

// Demo-only analytics are computed on locally stored, synthetic orders.
export function demoSalesReport(orders:Order[],from:string,to:string):SalesReport{
  const warning=validateReportRange(from,to);if(warning)throw new Error(warning);
  const selected=orders.filter(order=>{const day=dhakaDate(order.created_at);return day>=from&&day<=to;});
  const totals={...EMPTY_TOTALS};const days=new Map<string,SalesDay>();const dishStats=new Map<string,SalesDish>();
  for(const order of selected){
    const day=dhakaDate(order.created_at);
    const row=days.get(day)??{day,orders:0,completed:0,cancelled:0,order_value:0,savings:0};
    row.orders++;totals.orders++;
    if(order.status==='cancelled'){row.cancelled++;totals.cancelled++;}
    else if(order.status==='completed'){
      row.completed++;totals.completed++;
      const orderValue=asInt(order.total);row.order_value+=orderValue;totals.order_value+=orderValue;
      totals.item_value+=asInt(order.subtotal);totals.delivery_fees+=asInt(order.delivery_fee);
      const couponSaving=asInt(order.coupon_discount);row.savings+=couponSaving;totals.savings+=couponSaving;
      for(const item of (order.order_items??[]) as OrderItem[]){
        const saving=Math.max(0,asInt(item.discount_unit_amount))*asInt(item.qty);
        row.savings+=saving;totals.savings+=saving;totals.units+=asInt(item.qty);
        const name=item.item_name||'Unknown item';const dish=dishStats.get(name)??{name,quantity:0,order_value:0,savings:0};
        dish.quantity+=asInt(item.qty);dish.order_value+=asInt(item.line_total);dish.savings+=saving;dishStats.set(name,dish);
      }
    }else totals.active++;
    days.set(day,row);
  }
  return {from,to,timezone:'Asia/Dhaka',totals,daily:[...days.values()].sort((a,b)=>a.day.localeCompare(b.day)),dishes:[...dishStats.values()].sort((a,b)=>b.quantity-a.quantity||a.name.localeCompare(b.name)),demo:true};
}

export const csvCell=(value:string|number):string=>{
  let text=String(value);
  // Spreadsheet formula injection: neutralize leading formula operators, including after whitespace.
  if(/^[\s\u0000-\u001f]*[=+@-]/.test(text))text="'"+text;
  return `"${text.replace(/"/g,'""')}"`;
};
export const csvTable=(headers:string[],rows:(string|number)[][]):string=>'\ufeff'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
export function salesCSV(report:SalesReport,granularity:'daily'|'monthly'|'dishes'):string{
  if(granularity==='dishes')return csvTable(['Item','Units sold','Completed item value (BDT)','Discount savings (BDT)'],report.dishes.map(x=>[x.name,x.quantity,x.order_value,x.savings]));
  if(granularity==='monthly')return csvTable(['Month (Dhaka)','All orders','Completed','Cancelled','Completed order value (BDT)','Discount savings (BDT)'],monthRollup(report.daily).map(x=>[x.month,x.orders,x.completed,x.cancelled,x.order_value,x.savings]));
  return csvTable(['Date (Asia/Dhaka)','All orders','Completed','Cancelled','Completed order value (BDT)','Discount savings (BDT)'],report.daily.map(x=>[x.day,x.orders,x.completed,x.cancelled,x.order_value,x.savings]));
}
