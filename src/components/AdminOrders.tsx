import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, Printer, RefreshCw, Search, X } from 'lucide-react';
import { getAdminOrderDetail, getAdminOrderPage } from '../data/api';
import { money, waitError } from '../lib/utils';
import {
  ADMIN_ORDER_PAGE_SIZE, ADMIN_ORDER_STATUSES, ORDER_STATUS_LABELS, ORDER_STATUS_NEXT,
  defaultOrderFilter, orderDateTime, validateOrderFilters, type OrderFilter
} from '../lib/orderManagement';
import type { Order, OrderStatus } from '../types';

interface Props {
  refreshSignal:string;
  busy:boolean;
  onStatusChange:(order:Order,status:OrderStatus)=>Promise<boolean>;
}

export default function AdminOrders({refreshSignal,busy,onStatusChange}:Props){
  const [filters,setFilters]=useState<OrderFilter>(defaultOrderFilter);
  const [draftSearch,setDraftSearch]=useState('');
  const [page,setPage]=useState(1);
  const [orders,setOrders]=useState<Order[]>([]);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(true);
  const [listError,setListError]=useState('');
  const [detail,setDetail]=useState<Order|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [detailError,setDetailError]=useState('');
  const [refreshVersion,setRefreshVersion]=useState(0);
  const detailRequest=useRef(0);
  const invalid=validateOrderFilters(filters);
  const pages=Math.max(1,Math.ceil(total/ADMIN_ORDER_PAGE_SIZE));
  const updateFilter=<K extends keyof OrderFilter>(key:K,value:OrderFilter[K])=>{
    setFilters(prev=>({...prev,[key]:value}));setPage(1);
  };
  useEffect(()=>{
    const handle=window.setTimeout(()=>updateFilter('search',draftSearch),350);
    return()=>window.clearTimeout(handle);
  },[draftSearch]);
  const refresh=()=>setRefreshVersion(n=>n+1);

  useEffect(()=>{
    if(invalid){setListError(invalid);setLoading(false);return;}
    let valid=true;setLoading(true);setListError('');
    void getAdminOrderPage(filters,page).then(result=>{
      if(!valid)return;
      setOrders(result.rows);setTotal(result.total);
      if(page>1&&result.total>0&&(page-1)*ADMIN_ORDER_PAGE_SIZE>=result.total)setPage(Math.max(1,Math.ceil(result.total/ADMIN_ORDER_PAGE_SIZE)));
    }).catch(e=>{if(valid){setListError(waitError(e));setOrders([]);setTotal(0);}}).finally(()=>{if(valid)setLoading(false);});
    return()=>{valid=false;};
  },[filters,page,invalid,refreshSignal,refreshVersion]);

  const showDetail=useCallback(async(id:string)=>{
    const request=++detailRequest.current;
    setDetailLoading(true);setDetailError('');setDetail(null);
    try{const order=await getAdminOrderDetail(id);if(request===detailRequest.current)setDetail(order);}
    catch(e){if(request===detailRequest.current)setDetailError(waitError(e));}
    finally{if(request===detailRequest.current)setDetailLoading(false);}
  },[]);
  const change=async(o:Order,status:OrderStatus)=>{
    const success=await onStatusChange(o,status);
    if(success){refresh();if(detail?.id===o.id)await showDetail(o.id);}
  };
  const closeDetail=()=>{++detailRequest.current;setDetail(null);setDetailLoading(false);setDetailError('');};
  useEffect(()=>{
    if(!detail&&!detailLoading&&!detailError)return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')closeDetail();};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[detail,detailLoading,detailError]);
  const rangeText=useMemo(()=>total===0?'0 orders':`${(page-1)*ADMIN_ORDER_PAGE_SIZE+1}–${Math.min(page*ADMIN_ORDER_PAGE_SIZE,total)} of ${total} orders`,[page,total]);
  return <section className="mt-9 space-y-5" data-testid="admin-order-manager">
    <div className="panel p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-xl">Order management</h2><p className="text-xs mt-1 text-[#857367]">Search all orders • dates use Asia/Dhaka time</p></div><button type="button" onClick={refresh} className="btn-secondary !py-2"><RefreshCw size={16}/> Refresh</button></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-[1fr_160px_180px_170px_170px] gap-3 items-end">
        <label className="field">Search orders<div className="flex items-stretch border border-[#dfd1c3]"><Search size={16} className="self-center ml-3 text-[#a0806b] shrink-0"/><input aria-label="Search orders" className="!border-0 min-w-0" maxLength={80} placeholder="Code, name or phone" value={draftSearch} onChange={e=>setDraftSearch(e.target.value)}/></div></label>
        <label className="field">Search by<select value={filters.searchField} onChange={e=>updateFilter('searchField',e.target.value as OrderFilter['searchField'])}><option value="code">Order code</option><option value="customer_name">Customer name</option><option value="customer_phone">Phone</option></select></label>
        <label className="field">Order status<select value={filters.status} onChange={e=>updateFilter('status',e.target.value as OrderFilter['status'])}><option value="all">All statuses</option>{ADMIN_ORDER_STATUSES.map(s=><option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}</select></label>
        <label className="field">From date<input type="date" value={filters.fromDate} onChange={e=>updateFilter('fromDate',e.target.value)}/></label>
        <label className="field">To date<input type="date" value={filters.toDate} onChange={e=>updateFilter('toDate',e.target.value)}/></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[#817064]" aria-live="polite">{loading?'Loading orders…':rangeText}</span><button className="text-sm font-bold text-[#a84528] disabled:opacity-40" type="button" disabled={!filters.search&&!filters.fromDate&&!filters.toDate&&filters.status==='all'&&filters.searchField==='code'&&!draftSearch} onClick={()=>{setDraftSearch('');setFilters(defaultOrderFilter());setPage(1);}}>Clear filters</button></div>
    </div>
    {listError&&<div role="alert" className="notice-error">{listError}</div>}
    {loading?<div className="panel p-10 text-center text-[#8b7564]">Loading orders…</div>:!listError&&orders.length===0?<div className="empty-state"><ClipboardList size={28} className="mx-auto mb-3"/>No orders match your filters.</div>:<div className="space-y-3">{orders.map(o=><article className="panel p-5 sm:p-6" key={o.id}>
      <div className="flex flex-wrap justify-between gap-3"><div><div className="eyebrow">{o.code} · {orderDateTime(o.created_at)}</div><h3 className="font-extrabold text-lg mt-2">{o.customer_name}</h3><p className="text-sm text-[#827467] mt-1">{o.customer_phone} · {o.fulfillment_type}</p></div><div className="text-right"><strong className="text-xl">{money(o.total)}</strong><div className="status-tag mt-2">{ORDER_STATUS_LABELS[o.status]}</div></div></div>
      <div className="border-t border-[#f0e5dc] mt-4 pt-4 flex flex-wrap gap-3 items-end justify-between"><button className="btn-secondary !py-2" type="button" onClick={()=>void showDetail(o.id)}>View details / print</button><label className="field !gap-1">Change status<select className="admin-select" disabled={busy||ORDER_STATUS_NEXT[o.status].length===0} value={o.status} onChange={e=>void change(o,e.target.value as OrderStatus)}><option value={o.status}>{ORDER_STATUS_LABELS[o.status]}</option>{ORDER_STATUS_NEXT[o.status].map(s=><option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}</select></label></div>
    </article>)}</div>}
    {!listError&&total>0&&<nav aria-label="Order pages" className="flex items-center justify-between gap-3 panel p-4"><button className="btn-secondary !py-2" type="button" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/> Previous</button><span className="font-semibold text-sm tabular-nums">Page {page} / {pages}</span><button className="btn-secondary !py-2" type="button" disabled={loading||page>=pages} onClick={()=>setPage(p=>p+1)}>Next <ChevronRight size={16}/></button></nav>}
    {(detail||detailLoading||detailError)&&<div className="modal-backdrop order-detail-overlay" role="presentation" onClick={closeDetail}><div className="modal-dialog !max-w-[740px]" role="dialog" aria-modal="true" aria-label="Order details" onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between mb-5 no-print"><h2 className="font-extrabold text-xl">Order details</h2><button aria-label="Close order details" type="button" onClick={closeDetail}><X size={22}/></button></div>
      {detailLoading?<p className="py-12 text-center">Loading details…</p>:detailError?<div role="alert" className="notice-error">{detailError}</div>:detail&&<>
        <div className="print-kitchen" id="chap-khana-kitchen-ticket">
          <div className="border-b-2 border-black pb-3 mb-4"><h2 className="text-2xl font-extrabold">চাপ খানা · CHAP KHANA</h2><p className="text-sm font-bold uppercase mt-1">Kitchen Order Ticket · Staff copy</p><p className="text-xs mt-1">Not a tax invoice</p></div>
          <div className="space-y-1.5 text-sm"><p><strong>Order:</strong> {detail.code}</p><p><strong>Placed:</strong> {orderDateTime(detail.created_at)}</p><p><strong>Status:</strong> {ORDER_STATUS_LABELS[detail.status]}</p><p><strong>Type:</strong> {detail.fulfillment_type.toUpperCase()}</p><p><strong>Customer:</strong> {detail.customer_name}</p><p><strong>Phone:</strong> {detail.customer_phone}</p>{detail.delivery_address&&<p><strong>Address:</strong> {detail.delivery_address}</p>}</div>
          <div className="border-y border-[#d4ccc4] py-3 my-4"><h3 className="font-bold mb-3">Ordered items</h3>{detail.order_items?.length?detail.order_items.map((i,n)=><div key={i.id??n} className="flex justify-between gap-3 py-2 border-b last:border-0 border-[#eee6df]"><div><strong>{i.qty} × {i.item_name}</strong><p className="text-xs text-[#776a60]">{money(i.unit_price)} each</p></div><strong>{money(i.line_total)}</strong></div>):<p className="text-sm">No order lines found.</p>}</div>
          {detail.notes&&<div className="border-2 border-[#936244] p-3 mb-4"><strong>Kitchen / customer instructions</strong><p className="mt-2 whitespace-pre-wrap break-words">{detail.notes}</p></div>}
          <div className="text-sm space-y-2"><div className="flex justify-between"><span>Items subtotal</span><strong>{money(detail.subtotal)}</strong></div><div className="flex justify-between"><span>Delivery fee</span><strong>{money(detail.delivery_fee)}</strong></div><div className="flex justify-between font-extrabold text-lg border-t pt-2"><span>Total</span><span>{money(detail.total)}</span></div></div>
          <p className="text-xs mt-6 border-t pt-3">Prepared by staff · {new Date().toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})} (Dhaka)</p>
        </div>
        <div className="no-print flex flex-wrap gap-3 justify-between items-end mt-6 border-t pt-5"><label className="field">Update status<select value={detail.status} disabled={busy||ORDER_STATUS_NEXT[detail.status].length===0} onChange={e=>void change(detail,e.target.value as OrderStatus)}>{[detail.status,...ORDER_STATUS_NEXT[detail.status]].map(s=><option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}</select></label><button className="btn-primary" type="button" onClick={()=>window.print()}><Printer size={17}/> Print kitchen ticket</button></div>
      </>}
    </div></div>}
  </section>;
}
