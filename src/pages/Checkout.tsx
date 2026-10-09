import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BadgeCheck, ClipboardCopy, CreditCard, MapPin, ShoppingBag, Truck } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { placeOrder } from '../data/api';
import { money, validateCheckout, waitError } from '../lib/utils';
import { discountedUnitPrice, unitSavings } from '../lib/discount';
import type { CheckoutInfo, OrderReceipt } from '../types';

export default function Checkout(){
  const {t,cart,menu,settings,subtotal,count,user,clearCart,notify,live}=useShop();
  const [info,setInfo]=useState<CheckoutInfo>({name:user?.user_metadata?.full_name||'',phone:'',type:settings.pickup_enabled?'pickup':'delivery',address:'',notes:''});
  const requestId=useRef(crypto.randomUUID());
  const [busy,setBusy]=useState(false);const [issue,setIssue]=useState('');const [result,setResult]=useState<OrderReceipt|null>(null);
  if(!count&&!result) return <Navigate to="/cart" replace/>;
  const deliveryFee=info.type==='delivery'?settings.delivery_fee:0;const savings=menu.reduce((sum,item)=>sum+unitSavings(item)*(cart[item.id]||0),0);
  const update=(key:keyof CheckoutInfo,val:string)=>setInfo(prev=>({...prev,[key]:val}));
  const onSubmit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(busy)return;
    const error=validateCheckout(info,cart,menu,settings);
    if(error){setIssue(error);return;}setIssue('');setBusy(true);
    try {const order=await placeOrder(info,cart,menu,settings,requestId.current);setResult(order);clearCart();window.scrollTo({top:0,behavior:'smooth'});}
    catch(e){setIssue(waitError(e));} finally{setBusy(false);}
  };
  if(result){const trackUrl=`${location.origin}/track?token=${encodeURIComponent(result.tracking_token)}`;
    return <div className="site-wrap page-pad"><div className="success-card"><span className="success-icon"><BadgeCheck size={40}/></span><div className="section-kicker justify-center">ORDER RECEIVED</div><h1 className="page-title mt-3">{t.success}</h1><p className="mt-3 text-[#776960] max-w-lg mx-auto">{result.demo?t.demoSuccess:t.liveSuccess}</p><div className="receipt-summary"><div className="summary-line"><span>Order reference</span><strong>{result.code}</strong></div><div className="summary-line"><span>{t.total}</span><strong>{money(result.total)}</strong></div><div className="text-xs break-all text-[#86786e] mt-4">Tracking: {result.tracking_token}</div></div><div className="flex flex-wrap justify-center gap-3 mt-8"><button className="btn-primary" onClick={()=>{void navigator.clipboard.writeText(trackUrl).then(()=>notify('Tracking link copied'));}}><ClipboardCopy size={18}/>{t.copy}</button><Link to={`/track?token=${encodeURIComponent(result.tracking_token)}`} className="btn-secondary">{t.trackNow}<ArrowRight size={18}/></Link></div></div></div>;
  }
  return <section className="site-wrap page-pad"><Link to="/cart" className="back-link"><ArrowLeft size={16}/>{t.bag}</Link><div className="section-kicker"><span/> ALMOST THERE</div><h1 className="page-title mb-10">{t.checkout}<span className="text-ember">.</span></h1>
    <form onSubmit={e=>void onSubmit(e)} className="grid lg:grid-cols-[1.35fr_.8fr] gap-8 items-start">
      <div className="panel p-6 sm:p-9"><h2 className="form-heading"><Truck size={22}/>{t.type}</h2><div className="grid sm:grid-cols-2 gap-3 mb-9">{settings.pickup_enabled&&<button type="button" onClick={()=>update('type','pickup')} className={`method-card ${info.type==='pickup'?'method-selected':''}`}><ShoppingBag size={25}/><strong>{t.pickup}</strong><span>Collect at the restaurant</span></button>}{settings.delivery_enabled&&<button type="button" onClick={()=>update('type','delivery')} className={`method-card ${info.type==='delivery'?'method-selected':''}`}><MapPin size={25}/><strong>{t.delivery}</strong><span>{money(settings.delivery_fee)} delivery fee</span></button>}</div>
        <h2 className="form-heading"><CreditCard size={22}/>{t.details}</h2><div className="grid sm:grid-cols-2 gap-5"><label className="field">{t.name} *<input required maxLength={80} minLength={2} value={info.name} autoComplete="name" onChange={e=>update('name',e.target.value)} placeholder="Your full name"/></label><label className="field">{t.phone} *<input required value={info.phone} onChange={e=>update('phone',e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX"/></label></div>
        {info.type==='delivery'&&<label className="field mt-5">{t.address} *<textarea required minLength={8} maxLength={350} rows={3} value={info.address} onChange={e=>update('address',e.target.value)} placeholder="House, road, area, landmark"/></label>}
        <label className="field mt-5">{t.note}<textarea value={info.notes} onChange={e=>update('notes',e.target.value)} maxLength={500} rows={3} placeholder="Less spicy, landmark, etc."/></label>
        <div className="rounded-md border border-[#eedacc] p-4 bg-[#fff8f1] mt-6 text-sm flex gap-3 items-center"><CreditCard size={22} className="text-ember shrink-0"/><div><strong>{t.pay}</strong><p className="text-[#8a7265] mt-1">Online/card payments are not enabled.</p></div></div>
        {issue&&<div role="alert" className="notice-error mt-5">{issue}</div>}
        {!settings.accepting_orders&&<div role="alert" className="notice-error mt-4">Online ordering is paused by staff.</div>}
        <button disabled={busy||!settings.accepting_orders} type="submit" className="btn-primary w-full justify-center mt-7">{busy?t.placing:live?t.place:t.demoPlace}<ArrowRight size={17}/></button>
        <p className="text-xs text-[#9c8b81] mt-4">{live?'Submitting creates a real order in the configured Supabase project.':'This is a local demo order only. No restaurant receives it.'}</p>
      </div>
      <aside className="summary-card"><h2 className="text-xl font-bold mb-6">{t.review}</h2>{menu.filter(m=>cart[m.id]).map(m=><div className="summary-line" key={m.id}><span>{m.name} <small>× {cart[m.id]}</small></span><strong>{money((discountedUnitPrice(m)||0)*(cart[m.id]||0))}</strong></div>)}{savings>0&&<div className="summary-line text-green-700"><span>Discount savings</span><strong>−{money(savings)}</strong></div>}<div className="summary-line pt-6 border-t border-[#e9dfd5] mt-4"><span>{t.subtotal}</span><strong>{money(subtotal)}</strong></div><div className="summary-line"><span>{t.fee}</span><strong>{money(deliveryFee)}</strong></div><div className="summary-line total-line"><span>{t.total}</span><strong>{money(subtotal+deliveryFee)}</strong></div><p className="mt-5 text-xs text-[#927f73]">Final prices and delivery fees are recomputed and verified in Postgres at submission.</p></aside>
    </form>
  </section>;
}
