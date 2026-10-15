import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChefHat, Clock3, ClipboardList, RefreshCw, ShieldCheck, Timer, X } from 'lucide-react';
import { advanceKitchenOrder, getKitchenQueue, getKitchenStatusEvents, type KitchenStatusEvent } from '../data/api';
import { KITCHEN_ACTION_LABEL, KITCHEN_COLUMNS, groupKitchenOrders, kitchenNext, kitchenUrgency, queueMinutes, type KitchenOrder } from '../lib/kitchen';
import { ORDER_STATUS_LABELS, orderDateTime } from '../lib/orderManagement';
import { waitError } from '../lib/utils';
import type { OrderStatus } from '../types';

function QueueCard({order,now,busy,onAdvance,onHistory}:{order:KitchenOrder;now:number;busy:boolean;onAdvance:(order:KitchenOrder,next:OrderStatus)=>void;onHistory:(order:KitchenOrder)=>void}){
  const elapsed=queueMinutes(order.created_at,now);
  const urgency=kitchenUrgency(elapsed);
  const next=kitchenNext(order.status,order.fulfillment_type);
  const items=order.order_items||[];
  return <article className={`rounded-xl border-2 bg-white p-4 shadow-sm space-y-3 ${urgency==='late'?'border-red-400':urgency==='watch'?'border-amber-400':'border-[#e6d4c3]'}`} aria-label={`Kitchen order ${order.code}`}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-extrabold text-lg">{order.code}</h4><p className="text-xs text-[#887163]">{order.fulfillment_type==='delivery'?'Delivery':'Pickup'} · {orderDateTime(order.created_at)}</p></div>
      <div className={`text-sm font-bold rounded-lg px-2 py-1 flex items-center gap-1 ${urgency==='late'?'bg-red-100 text-red-800':urgency==='watch'?'bg-amber-100 text-amber-900':'bg-[#f5eee7] text-[#674d3c]'}`}><Timer size={14}/>{elapsed} min</div></div>
    <p className="text-xs font-bold uppercase tracking-wide text-[#9a5a37]">{ORDER_STATUS_LABELS[order.status]}</p>
    <div className="border-t border-[#e9dcd0] pt-3 space-y-2">{items.length?items.map((item,index)=><div key={item.id??index} className="flex gap-2 text-sm"><strong className="shrink-0">{item.qty} ×</strong><span className="font-semibold break-words">{item.item_name}</span></div>):<p className="text-xs text-[#826f60]">No item details received. Refresh.</p>}</div>
    {order.notes?.trim()&&<div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><p className="text-xs font-bold mb-1">Kitchen instructions</p><p className="text-sm whitespace-pre-wrap break-words">{order.notes}</p></div>}
    <div className="pt-2 flex flex-wrap gap-2">{next&&<button type="button" className="btn-primary !py-2 !px-3 text-sm flex-1 justify-center" disabled={busy} onClick={()=>onAdvance(order,next)}>{busy?'Updating…':KITCHEN_ACTION_LABEL[next]||'Advance order'}</button>}
      <button type="button" className="btn-secondary !py-2 !px-3 text-sm" onClick={()=>onHistory(order)} aria-label={`Status history for ${order.code}`} title="Status history"><ClipboardList size={16}/></button></div>
  </article>;
}

export default function AdminKitchen({live,onOrdersChanged}:{live:boolean;onOrdersChanged?:()=>Promise<void>}){
  const [orders,setOrders]=useState<KitchenOrder[]>([]);const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [busyId,setBusyId]=useState('');const [updatedAt,setUpdatedAt]=useState<Date|null>(null);
  const [now,setNow]=useState(Date.now());
  const [selected,setSelected]=useState<KitchenOrder|null>(null);
  const [history,setHistory]=useState<KitchenStatusEvent[]>([]);
  const [historyError,setHistoryError]=useState('');const [historyLoading,setHistoryLoading]=useState(false);
  const fetchSeq=useRef(0);const historySeq=useRef(0);
  const refresh=useCallback(async()=>{
    const request=++fetchSeq.current;
    try {const next=await getKitchenQueue();if(request===fetchSeq.current){setOrders(next);setUpdatedAt(new Date());setError('');}}
    catch(e){if(request===fetchSeq.current)setError(waitError(e));}
    finally{if(request===fetchSeq.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    void refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},12000);
    const onFocus=()=>{if(document.visibilityState==='visible')void refresh();};
    document.addEventListener('visibilitychange',onFocus);
    return()=>{++fetchSeq.current;window.clearInterval(timer);document.removeEventListener('visibilitychange',onFocus);};
  },[refresh]);
  useEffect(()=>{
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')setNow(Date.now());},30000);
    return()=>window.clearInterval(timer);
  },[]);
  const grouped=useMemo(()=>groupKitchenOrders(orders),[orders]);
  const advance=async(order:KitchenOrder,next:OrderStatus)=>{
    if(busyId)return;setBusyId(order.id);setError('');setNotice('');
    try{await advanceKitchenOrder(order,next);setNotice(`${order.code}: ${ORDER_STATUS_LABELS[next]}`);await refresh();await onOrdersChanged?.();}
    catch(e){const message=waitError(e);setError(message.includes('kitchen_advance_order')?'Run Supabase SQL migration 18 before changing kitchen statuses.':message);await refresh();}
    finally{setBusyId('');}
  };
  const openHistory=async(order:KitchenOrder)=>{
    const request=++historySeq.current;
    setSelected(order);setHistory([]);setHistoryError('');setHistoryLoading(true);
    try{const events=await getKitchenStatusEvents(order.id);if(request===historySeq.current)setHistory(events);}
    catch(e){if(request===historySeq.current)setHistoryError(waitError(e));}
    finally{if(request===historySeq.current)setHistoryLoading(false);}
  };
  return <div className="mt-8 space-y-5" data-testid="admin-kitchen">
    <section className="panel p-5 sm:p-7"><div className="flex flex-wrap justify-between gap-3 items-start"><div><h2 className="text-2xl font-extrabold flex items-center gap-2"><ChefHat size={26}/> Kitchen display</h2><p className="text-sm mt-2 text-[#826e60]">Live preparation queue · Oldest orders first · Times are minutes since each order was placed.</p></div>
      <button className="btn-secondary" disabled={loading||Boolean(busyId)} onClick={()=>{setLoading(true);void refresh();}}><RefreshCw size={16}/> Refresh queue</button></div>
      {!live&&<p className="notice mt-4">Demo mode. Status changes are local to this browser.</p>}
      {orders.length>=100&&<div className="notice-error mt-4" role="alert">Queue is capped at 100 oldest active orders. Clear the queue or use Order Management for additional orders.</div>}
      {error&&<div className="notice-error mt-4" role="alert">{error}</div>}
      {notice&&<p className="text-green-800 font-semibold mt-3" role="status">{notice}</p>}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 text-xs text-[#887265]"><span className="inline-flex items-center gap-1"><Clock3 size={14}/> Updated {updatedAt?updatedAt.toLocaleTimeString('en-BD'):'—'} · Auto-refresh 12 seconds (while visible)</span><span><span className="text-amber-800 font-bold">15+ min</span> needs attention</span><span><span className="text-red-700 font-bold">30+ min</span> high priority</span></div>
    </section>
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">{KITCHEN_COLUMNS.map(column=><section key={column.key} className="rounded-2xl bg-[#f8efe7] border border-[#ead7c6] p-3 sm:p-4 min-w-0" aria-label={column.title}>
      <div className="flex items-center justify-between gap-2 mb-1"><h3 className="font-extrabold text-lg">{column.title}</h3><span className="rounded-full bg-[#fffaf6] px-2 py-1 text-xs font-bold">{grouped[column.key].length}</span></div><p className="text-xs text-[#8b7464] mb-4">{column.subtitle}</p>
      <div className="space-y-3">{grouped[column.key].map(order=><QueueCard key={order.id} order={order} now={now} busy={Boolean(busyId)} onAdvance={advance} onHistory={openHistory}/>)}
        {!grouped[column.key].length&&<p className="text-center text-sm text-[#8c7b6e] bg-white/80 rounded-xl py-9">{loading?'Loading…':'No orders here'}</p>}</div>
    </section>)}</div>
    <div className="flex items-center gap-2 text-xs text-[#877568]"><ShieldCheck size={15}/> Kitchen status changes are checked in PostgreSQL against the latest order state. Cancelling orders remains in Order Management.</div>
    {selected&&<div className="modal-backdrop" role="presentation" onClick={()=>{++historySeq.current;setSelected(null);}}><div className="modal-dialog !max-w-[560px]" role="dialog" aria-modal="true" aria-label={`Status history ${selected.code}`} onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 mb-4"><h3 className="font-bold text-xl">{selected.code} — status history</h3><button type="button" aria-label="Close history" onClick={()=>{++historySeq.current;setSelected(null);}}><X size={20}/></button></div>
      {historyLoading?<p>Loading history…</p>:historyError?<div className="notice-error" role="alert">{historyError} — Check staff access and status-audit migration 03.</div>:history.length?<div className="space-y-3">{history.map(row=><div key={row.id} className="border-b pb-2"><p className="font-semibold text-sm">{row.previous_status} → {row.next_status}</p><p className="text-xs text-[#8b7564]">{orderDateTime(row.changed_at)}</p></div>)}</div>:<p className="text-sm text-[#826f60]">No status changes recorded yet. Earlier changes are not backfilled.</p>}
    </div></div>}
  </div>;
}
