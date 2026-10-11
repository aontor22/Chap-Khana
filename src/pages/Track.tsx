import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, ClipboardCopy, Clock3, Phone, RefreshCw, Search, ShieldCheck, XCircle } from 'lucide-react';
import { trackOrder } from '../data/api';
import { useShop } from '../context/ShopContext';
import { money, waitError } from '../lib/utils';
import { journeySteps, orderHelp, orderStatusLabel, shouldPollOrder } from '../lib/orderJourney';
import type { TrackingResult } from '../types';

export default function Track(){
  const {t,locale,settings}=useShop();
  const [params,setParams]=useSearchParams();
  const queryToken=(params.get('token')||'').trim();
  const [token,setToken]=useState(queryToken);
  const [result,setResult]=useState<TrackingResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const [lastChecked,setLastChecked]=useState<Date|null>(null);
  const requestSeq=useRef(0);
  const refresh=useCallback(async (silent=false)=>{
    if(!queryToken)return;
    const seq=++requestSeq.current;
    if(!silent){setBusy(true);setError('');}
    try{
      const res=await trackOrder(queryToken);
      if(seq!==requestSeq.current)return;
      if(!res)throw new Error('Order not found. Check your private tracking token.');
      setResult(res);setLastChecked(new Date());setError('');
    }catch(err){
      if(seq!==requestSeq.current)return;
      setError(waitError(err));
      if(!silent)setResult(null);
    }finally{if(seq===requestSeq.current)setBusy(false);}
  },[queryToken]);
  useEffect(()=>{
    setToken(queryToken);setResult(null);setError('');setFeedback('');setLastChecked(null);
    if(queryToken)void refresh();
    return ()=>{requestSeq.current+=1;};
  },[queryToken,refresh]);
  // Safe polling fallback: only while this tab is visible and order is not terminal.
  useEffect(()=>{
    if(!queryToken||!shouldPollOrder(result?.status||null))return;
    const interval=window.setInterval(()=>{
      if(document.visibilityState==='visible')void refresh(true);
    },30000);
    return ()=>window.clearInterval(interval);
  },[queryToken,result?.status,refresh]);
  const submit=(event:FormEvent)=>{
    event.preventDefault();const submitted=token.trim();
    if(!submitted)return;
    if(submitted===queryToken)void refresh();else setParams({token:submitted});
  };
  const copy=async()=>{
    try{await navigator.clipboard.writeText(window.location.href);setFeedback(locale==='bn'?'লিংক কপি হয়েছে':'Private tracking link copied');}
    catch{setFeedback(locale==='bn'?'লিংক কপি করা যায়নি':'Could not copy the link');}
  };
  const steps=result?journeySteps(result.status,result.fulfillment_type,locale):[];
  return <section className="site-wrap page-pad max-w-3xl">
    <div className="text-center"><div className="section-kicker justify-center">YOUR ORDER, STEP BY STEP</div>
      <h1 className="page-title">{t.check}</h1>
      <p className="text-[#8c8077] mt-3">{locale==='bn'?'আপনার গোপন ট্র্যাকিং লিংক ব্যবহার করুন। এটি প্রকাশ্যে শেয়ার করবেন না।':'Use your private tracking link. Do not share it publicly.'}</p>
    </div>
    <form onSubmit={submit} className="panel p-5 sm:p-8 mt-9"><label className="field">{t.token}
      <div className="flex gap-2 mt-2"><input required className="flex-1 min-w-0" value={token} onChange={e=>setToken(e.target.value)} placeholder="Paste tracking UUID" autoComplete="off" spellCheck={false} maxLength={80}/>
        <button className="btn-primary shrink-0" disabled={busy} type="submit"><Search size={17}/><span className="hidden sm:inline">{busy?'Checking…':t.find}</span></button></div></label>
      {error&&<div role="alert" className="notice-error mt-5">{error}</div>}
    </form>
    {result&&<article className="panel p-6 sm:p-10 mt-6" aria-label="Order progress">
      <div className="flex items-center justify-between flex-wrap gap-4"><div><div className="eyebrow">{locale==='bn'?'অর্ডার নম্বর':'ORDER NUMBER'}</div><h2 className="font-bold text-2xl">{result.code}</h2><p className="text-sm text-[#96887e] mt-1">{new Date(result.created_at).toLocaleString(locale==='bn'?'bn-BD':'en-BD',{timeZone:'Asia/Dhaka'})}</p></div><strong className="text-2xl">{money(result.total)}</strong></div>
      <div role="status" aria-live="polite" className={`notice mt-7 ${result.status==='cancelled'?'!bg-red-50 !text-red-800':''}`}>
        <div className="flex items-start gap-3">{result.status==='cancelled'?<XCircle size={21} className="shrink-0"/>:<Clock3 size={21} className="shrink-0"/>}<div><strong>{orderStatusLabel(result.status,locale)}</strong><p className="mt-1">{orderHelp(result.status,result.fulfillment_type,locale)}</p></div></div>
      </div>
      {steps.length>0&&<ol className="status-timeline" aria-label="Order journey">{steps.map(step=><li key={step.status} className={step.reached?'done':''} aria-current={step.current?'step':undefined}>
        <div className="step-indicator">{step.reached?<Check size={14}/>:<Clock3 size={14}/>}</div><span>{step.label}</span></li>)}</ol>}
      <div className="flex flex-wrap gap-3 mt-9 no-print"><button className="btn-secondary" disabled={busy} onClick={()=>void refresh()} type="button"><RefreshCw size={16}/>{locale==='bn'?'আপডেট দেখুন':'Refresh status'}</button><button type="button" className="btn-secondary" onClick={()=>void copy()}><ClipboardCopy size={16}/>{t.copy}</button></div>
      {lastChecked&&<p className="text-xs text-[#928174] mt-4">{locale==='bn'?'সর্বশেষ যাচাই':'Last checked'}: {lastChecked.toLocaleTimeString(locale==='bn'?'bn-BD':'en-BD')} · {locale==='bn'?'পেজ খোলা থাকলে প্রতি ৩০ সেকেন্ডে আপডেট হয়':'Refreshes every 30 seconds while this tab is open'}</p>}
      {feedback&&<p role="status" className="text-sm mt-4 text-[#795543]">{feedback}</p>}
      {settings.contact_phone&&<a className="inline-flex items-center text-ember font-bold gap-2 text-sm mt-7" href={`tel:${settings.contact_phone.replace(/[^+\d]/g,'')}`}><Phone size={16}/>{locale==='bn'?'সাহায্য দরকার? কল করুন':'Need help? Call the restaurant'}</a>}
    </article>}
    <p className="mt-7 text-xs text-[#95867a] flex items-start gap-2"><ShieldCheck size={17} className="shrink-0"/>{locale==='bn'?'স্ট্যাটাস শুধুমাত্র রেস্টুরেন্টের আপডেট অনুযায়ী দেখানো হয়। কোনো আনুমানিক ডেলিভারি সময় দেওয়া হচ্ছে না।':'Status reflects restaurant updates only; no delivery ETA is promised.'}</p>
    <div className="mt-6 text-center"><Link to="/menu" className="text-ember text-sm font-bold inline-flex items-center gap-2">{t.browse}<ArrowRight size={16}/></Link></div>
  </section>;
}
