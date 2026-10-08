import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Clock3, Search } from 'lucide-react';
import { trackOrder } from '../data/api';
import { useShop } from '../context/ShopContext';
import { money, waitError } from '../lib/utils';
import type { TrackingResult, OrderStatus } from '../types';
const flow:OrderStatus[]=['pending','confirmed','preparing','ready','out_for_delivery','completed'];
const statusName:Record<OrderStatus,string>={pending:'Awaiting confirmation',confirmed:'Confirmed',preparing:'Preparing',ready:'Ready for pickup',out_for_delivery:'On the way',completed:'Completed',cancelled:'Cancelled'};
export default function Track(){
  const {t}=useShop();const [params,setParams]=useSearchParams();const [token,setToken]=useState(params.get('token')||'');const [result,setResult]=useState<TrackingResult|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const find=async(search:string)=>{if(!search.trim())return;setBusy(true);setError('');setResult(null);try{const res=await trackOrder(search.trim());if(!res)throw new Error('Order not found. Check the tracking token.');setResult(res);}catch(e){setError(waitError(e));}finally{setBusy(false);}};
  useEffect(()=>{const param=params.get('token');if(param){setToken(param);void find(param);}/* run for navigation token changes only */},[params]);
  const submit=(e:FormEvent)=>{e.preventDefault();setParams({token});};
  const current= result?.status==='cancelled'?-1:flow.indexOf(result?.status||'pending');
  return <section className="site-wrap page-pad max-w-3xl"><div className="text-center"><div className="section-kicker justify-center">YOUR ORDER, STEP BY STEP</div><h1 className="page-title">{t.check}</h1><p className="text-[#8c8077] mt-3">Use the private tracking token from your confirmation. Do not share it publicly.</p></div>
    <form onSubmit={submit} className="panel p-5 sm:p-8 mt-9"><label className="field">{t.token}<div className="flex gap-2 mt-2"><input required className="flex-1 min-w-0" value={token} onChange={e=>setToken(e.target.value)} placeholder="Paste tracking UUID"/><button className="btn-primary shrink-0" disabled={busy} type="submit"><Search size={17}/><span className="hidden sm:inline">{busy?'Checking…':t.find}</span></button></div></label>{error&&<div role="alert" className="notice-error mt-5">{error}</div>}</form>
    {result&&<div className="panel p-7 sm:p-10 mt-6"><div className="flex items-center justify-between flex-wrap gap-4"><div><div className="eyebrow">ORDER NUMBER</div><h2 className="font-bold text-2xl">{result.code}</h2><p className="text-sm text-[#96887e] mt-1">{new Date(result.created_at).toLocaleString('en-BD')}</p></div><strong className="text-2xl">{money(result.total)}</strong></div><div className={`notice mt-7 ${result.status==='cancelled'?'!bg-red-50':''}`}>{statusName[result.status]} · {result.fulfillment_type}</div>{result.status!=='cancelled'&&<ol className="status-timeline">{flow.filter(s=>result.fulfillment_type==='delivery'||s!=='out_for_delivery').map(s=>{const done=flow.indexOf(s)<=current;return <li key={s} className={done?'done':''}><div className="step-indicator">{done?<Check size={14}/>:<Clock3 size={14}/>}</div><span>{statusName[s]}</span></li>;})}</ol>}<button className="btn-secondary mt-7" onClick={()=>void find(token)}>Refresh status <ArrowRight size={16}/></button></div>}
  </section>;
}
