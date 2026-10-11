import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { getSalesReport } from '../data/api';
import { currentDhakaDate, monthRollup, monthStart, salesCSV, shiftISODate, validateReportRange, type SalesReport } from '../lib/salesAnalytics';
import { money, waitError } from '../lib/utils';

type Granularity='daily'|'monthly';
const prettyDay=(date:string)=>date;
const metric=(name:string,value:string,note:string)=><div className="stat-card" key={name}><p className="text-[#8c7e71] text-xs font-semibold">{name}</p><strong className="block text-2xl sm:text-3xl font-extrabold mt-3">{value}</strong><p className="text-[#998675] text-xs mt-2">{note}</p></div>;

function exportCSV(content:string,filename:string){
  const blob=new Blob([content],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function AdminSales({live}:{live:boolean}){
  const today=currentDhakaDate();
  const [from,setFrom]=useState(()=>shiftISODate(currentDhakaDate(),-29));
  const [to,setTo]=useState(()=>currentDhakaDate());
  const [granularity,setGranularity]=useState<Granularity>('daily');
  const [report,setReport]=useState<SalesReport|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [loadedPeriod,setLoadedPeriod]=useState('');
  const rangeError=validateReportRange(from,to);
  const dirty=loadedPeriod!==`${from}/${to}`;
  const load=useCallback(async(start:string,end:string)=>{
    const invalid=validateReportRange(start,end);if(invalid){setError(invalid);return;}
    setLoading(true);setError('');
    try { const next=await getSalesReport(start,end);setReport(next);setLoadedPeriod(`${start}/${end}`); }
    catch(e){setError(waitError(e));setReport(null);setLoadedPeriod('');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load(from,to);/* mount-only: changes require explicit Apply */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[load]);
  const rows=useMemo(()=>report?(granularity==='daily'?report.daily.map(d=>({label:d.day,value:d.order_value,orders:d.orders,completed:d.completed,cancelled:d.cancelled,savings:d.savings})):monthRollup(report.daily).map(m=>({label:m.month,value:m.order_value,orders:m.orders,completed:m.completed,cancelled:m.cancelled,savings:m.savings}))):[],[report,granularity]);
  const largest=Math.max(1,...rows.map(r=>r.value));
  const shortcuts=[{label:'Today',from:today,to:today},{label:'Last 7 days',from:shiftISODate(today,-6),to:today},{label:'Last 30 days',from:shiftISODate(today,-29),to:today},{label:'This month',from:monthStart(today),to:today}];
  return <section className="space-y-6 mt-8" aria-label="Sales analytics" data-testid="staff-sales-analytics">
    <div className="panel p-5 sm:p-7">
      <div className="flex flex-wrap gap-3 items-center justify-between"><div><h2 className="text-xl font-extrabold flex items-center gap-2"><BarChart3 size={22}/> Sales & Reports</h2><p className="text-xs text-[#8c7d72] mt-2">All dates use Asia/Dhaka (UTC+6). Maximum 366 days.</p></div><span className="text-xs text-[#806347] bg-[#f8ebdc] px-3 py-2 rounded">{live?'Live staff-only statistics':'Demo data · This browser only'}</span></div>
      <div className="flex flex-wrap gap-2 mt-6">{shortcuts.map(item=><button type="button" key={item.label} onClick={()=>{setFrom(item.from);setTo(item.to);}} className="category-pill">{item.label}</button>)}</div>
      <form className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end mt-5" onSubmit={e=>{e.preventDefault();void load(from,to);}}>
        <label className="field"><span><CalendarDays size={14} className="inline mr-1"/>From date</span><input type="date" value={from} max="2100-12-31" onChange={e=>setFrom(e.target.value)} required/></label>
        <label className="field">To date<input type="date" value={to} max="2100-12-31" onChange={e=>setTo(e.target.value)} required/></label>
        <button className="btn-primary min-h-12 justify-center" type="submit" disabled={loading||Boolean(rangeError)}><RefreshCw size={16}/>{loading?'Loading…':'Apply / Refresh'}</button>
      </form>
      {rangeError&&<p className="notice-error mt-4" role="alert">{rangeError}</p>}
      {dirty&&report&&!loading&&<p className="text-[#976625] text-xs mt-3">Date filter changed. Press Apply / Refresh to load the selected period.</p>}
      {error&&<div className="notice-error mt-4" role="alert">{error}{live&&error.toLowerCase().includes('staff_sales_report')&&<p className="mt-2 text-xs">Admin: run migration <code>11_staff_sales_analytics.sql</code> in Supabase before using live reports.</p>}</div>}
    </div>
    {loading&&!report&&<div className="panel p-10" role="status">Loading analytics…</div>}
    {report&&!dirty&&<>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
        {metric('Completed Order Value',money(report.totals.order_value),'Not verified payment collection')}
        {metric('Completed Orders',String(report.totals.completed),`From ${report.totals.orders} placed orders`)}
        {metric('Discount Savings',money(report.totals.savings),'Discounts on completed order items')}
        {metric('Delivery Fees',money(report.totals.delivery_fees),'Included in completed order value')}
      </div>
      <div className="panel p-5 sm:p-7">
        <div className="flex flex-wrap justify-between items-center gap-3"><div><h3 className="font-bold text-lg">Completed order value by {granularity==='daily'?'day':'month'}</h3><p className="text-[#8e8174] text-xs mt-1">Cancelled/pending orders excluded from value. Status measured now; date is order creation date.</p></div>
        <div className="flex flex-wrap gap-2"><select aria-label="Chart period grouping" className="admin-select" value={granularity} onChange={e=>setGranularity(e.target.value as Granularity)}><option value="daily">Daily</option><option value="monthly">Monthly</option></select><button className="btn-secondary !py-2" onClick={()=>exportCSV(salesCSV(report,granularity),`chap-khana-${granularity}-${report.from}-${report.to}.csv`)}><Download size={15}/> CSV</button></div></div>
        {rows.length?<div className="mt-6 space-y-3 max-h-[460px] overflow-y-auto" role="list" aria-label="Completed order value chart">{rows.map(row=><div className="grid grid-cols-[88px_minmax(0,1fr)_95px] sm:grid-cols-[110px_minmax(0,1fr)_130px] items-center gap-3 text-xs" role="listitem" key={row.label}>
          <span className="font-semibold text-[#6e5543]" title={row.label}>{prettyDay(row.label)}</span><div className="h-5 bg-[#f5e8dd] rounded overflow-hidden"><div className="h-full bg-[#b64a28] rounded" style={{width:`${row.value>0?Math.max(1,row.value/largest*100):0}%`}}/></div><span className="font-bold text-right">{money(row.value)}</span>
        </div>)}</div>:<p className="text-sm text-[#897b70] py-8">No orders in the selected period.</p>}
        <p className="text-[#8e8174] text-xs mt-4">Amounts are in BDT. Download the CSV for order counts, cancellations and discount savings by period.</p>
      </div>
      <div className="grid xl:grid-cols-2 gap-5">
        <div className="panel p-5 sm:p-7"><h3 className="text-lg font-bold">Orders by status</h3><div className="grid grid-cols-2 gap-4 mt-5">{[['All placed',report.totals.orders],['Completed',report.totals.completed],['Cancelled',report.totals.cancelled],['Open / in progress',report.totals.active]].map(([label,count])=><div key={label} className="bg-[#faf3ec] p-4"><span className="text-xs text-[#846e60]">{label}</span><strong className="block text-2xl mt-2">{count}</strong></div>)}</div><p className="text-[#8e8174] text-xs mt-4">Values can change when an order status changes. Reports group orders by placement date.</p></div>
        <div className="panel p-5 sm:p-7"><div className="flex justify-between items-center gap-3"><h3 className="text-lg font-bold">Popular dishes</h3><button className="btn-secondary !py-2" onClick={()=>exportCSV(salesCSV(report,'dishes'),`chap-khana-dishes-${report.from}-${report.to}.csv`)}><Download size={15}/> CSV</button></div><div className="mt-4 overflow-auto max-h-[360px]"><table className="w-full text-xs text-left"><thead><tr className="text-[#8d7768]"><th className="py-3">Item</th><th className="py-3 text-right">Qty</th><th className="py-3 text-right">Value</th><th className="py-3 text-right">Saved</th></tr></thead><tbody>{report.dishes.slice(0,30).map((dish,index)=><tr className="border-t border-[#f0e3d8]" key={`${dish.name}-${index}`}><td className="py-3 pr-3">{dish.name}</td><td className="py-3 text-right">{dish.quantity}</td><td className="py-3 text-right">{money(dish.order_value)}</td><td className="py-3 text-right text-green-700">{money(dish.savings)}</td></tr>)}</tbody></table>{report.dishes.length===0&&<p className="text-[#897b70] text-sm my-8">No completed dishes in this period.</p>}</div></div>
      </div>
      <p className="text-xs text-[#7f6f62] flex gap-2 items-start"><ShieldCheck size={16} className="shrink-0"/> Only aggregate totals are exported; customer names, phone numbers, addresses, and tracking tokens are excluded. This report uses completed order amounts, not proof of payment.</p>
    </>}
  </section>;
}
