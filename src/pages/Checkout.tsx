import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CreditCard, MapPin, ShoppingBag, Truck } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { placeOrder, quoteCoupon, getLoyaltySnapshot } from '../data/api';
import { maxRedeemablePoints, redemptionPreview, type LoyaltySnapshot } from '../lib/loyalty';
import { normalizeCouponCode, type CouponQuote } from '../lib/coupons';
import { money, validateCheckout, waitError } from '../lib/utils';
import { discountedUnitPrice, unitSavings } from '../lib/discount';
import type { CheckoutInfo } from '../types';
import { saveReceipt } from '../lib/orderReceipt';

export default function Checkout(){
  const {t,cart,menu,settings,subtotal,count,user,clearCart,live}=useShop();
  const navigate=useNavigate();
  const [info,setInfo]=useState<CheckoutInfo>({name:user?.user_metadata?.full_name||'',phone:'',type:settings.pickup_enabled?'pickup':'delivery',address:'',notes:''});
  const requestId=useRef(crypto.randomUUID());
  const [busy,setBusy]=useState(false);const [issue,setIssue]=useState('');
  const [couponInput,setCouponInput]=useState('');const [quote,setQuote]=useState<CouponQuote|null>(null);const [couponBusy,setCouponBusy]=useState(false);const [couponError,setCouponError]=useState('');
  const [quoteCartSignature,setQuoteCartSignature]=useState('');
  const [loyalty,setLoyalty]=useState<LoyaltySnapshot|null>(null);
  const [loyaltyError,setLoyaltyError]=useState('');
  const [redeemPoints,setRedeemPoints]=useState(0);
  useEffect(()=>{if(!live||!user){setLoyalty(null);setRedeemPoints(0);return;}let active=true;setLoyalty(null);setRedeemPoints(0);setLoyaltyError('');
    void getLoyaltySnapshot(user.id).then(data=>{if(active)setLoyalty(data);}).catch(e=>{if(active)setLoyaltyError(waitError(e));});
    return()=>{active=false;};},[user?.id,live]);
  if(!count) return <Navigate to="/cart" replace/>;
  const deliveryFee=info.type==='delivery'?settings.delivery_fee:0;const savings=menu.reduce((sum,item)=>sum+unitSavings(item)*(cart[item.id]||0),0);
  const update=(key:keyof CheckoutInfo,val:string)=>{if(key==='type')setQuote(null);setInfo(prev=>({...prev,[key]:val}));};
  const applyCoupon=async()=>{setCouponBusy(true);setCouponError('');setQuote(null);
    try{const value=await quoteCoupon(couponInput,cart,menu,info.type,deliveryFee);setQuote(value);setQuoteCartSignature(JSON.stringify(cart));}
    catch(e){setCouponError(waitError(e));}finally{setCouponBusy(false);} };
  const cartSignature=JSON.stringify(cart);
  const approvedQuote=quote&&quoteCartSignature===cartSignature&&quote.subtotal===subtotal?quote:null;
  const eligibleSubtotal=subtotal-(approvedQuote?.discount??0);
  const maxPoints=loyalty?maxRedeemablePoints(loyalty.account.balance,eligibleSubtotal,loyalty.settings):0;
  const approvedPoints=redeemPoints>0&&redeemPoints<=maxPoints&&redeemPoints>=(loyalty?.settings.minimum_redeem_points??Infinity)?redeemPoints:0;
  const rewardDiscount=approvedPoints&&loyalty?redemptionPreview(approvedPoints,loyalty.settings):0;
  const onSubmit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(busy)return;
    if(couponInput.trim()&&!approvedQuote){setIssue('Apply your coupon or clear the code before checkout.');return;}
    if(redeemPoints>0&&approvedPoints!==redeemPoints){setIssue('Your rewards balance or order has changed. Check your points and try again.');return;}
    const error=validateCheckout(info,cart,menu,settings);
    if(error){setIssue(error);return;}setIssue('');setBusy(true);
    try {const order=await placeOrder(info,cart,menu,settings,requestId.current,approvedQuote?.code,approvedPoints);const saved=saveReceipt(order,info.type,menu.filter(item=>cart[item.id]>0).map(item=>({name:item.name,qty:cart[item.id]})));clearCart();navigate('/order-confirmation',{replace:true,state:{receipt:saved}});}
    catch(e){setIssue(waitError(e));} finally{setBusy(false);}
  };
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
      <aside className="summary-card"><h2 className="text-xl font-bold mb-6">{t.review}</h2>{menu.filter(m=>cart[m.id]).map(m=><div className="summary-line" key={m.id}><span>{m.name} <small>× {cart[m.id]}</small></span><strong>{money((discountedUnitPrice(m)||0)*(cart[m.id]||0))}</strong></div>)}{savings>0&&<div className="summary-line text-green-700"><span>Item discount savings</span><strong>−{money(savings)}</strong></div>}<div className="summary-line pt-6 border-t border-[#e9dfd5] mt-4"><span>{t.subtotal}</span><strong>{money(subtotal)}</strong></div><div className="summary-line"><span>{t.fee}</span><strong>{money(deliveryFee)}</strong></div><div className="border-t border-[#ead6c6] pt-4 mt-4 space-y-2">
    <label className="field">Coupon code (optional)<div className="flex gap-2"><input maxLength={24} autoComplete="off" value={couponInput} placeholder="WELCOME10" onChange={e=>{setCouponInput(normalizeCouponCode(e.target.value));setQuote(null);setCouponError('');}}/><button type="button" disabled={couponBusy||busy||!couponInput.trim()||!settings.accepting_orders} className="btn-secondary !py-2" onClick={()=>void applyCoupon()}>{couponBusy?'Checking…':'Apply'}</button></div></label>
    {approvedQuote&&<div className="flex justify-between text-green-800 text-sm"><span>{approvedQuote.code} applied</span><button type="button" className="underline" onClick={()=>{setQuote(null);setCouponInput('');}}>Remove</button></div>}
    {couponError&&<p role="alert" className="text-red-700 text-sm">{couponError}</p>}
    {!live&&<p className="text-xs text-[#93776b]">Demo coupon: DEMO10. Live campaigns must be created by staff.</p>}
  </div>
  {live&&user&&<div className="border-t border-[#ead6c6] pt-4 mt-4 space-y-2" data-testid="checkout-loyalty">
    <h3 className="font-bold">Chap Khana Rewards</h3>
    {loyaltyError?<p role="alert" className="text-sm text-[#a34132]">{loyaltyError.includes('loyalty_')?'Rewards setup is pending (SQL 13).':loyaltyError}</p>:!loyalty?<p className="text-sm text-[#84746b]">Checking reward points…</p>:<>
      <p className="text-sm text-[#7d6d64]">{loyalty.account.balance} points available · {loyalty.settings.bdt_per_point} taka discount/point</p>
      {!loyalty.settings.enabled?<p className="text-xs">Rewards are currently paused.</p>:maxPoints===0?<p className="text-xs">Earn more points by completing orders. Minimum redemption: {loyalty.settings.minimum_redeem_points} points.</p>:
      <label className="field">Redeem points (max {maxPoints})<input type="number" min="0" max={maxPoints} step="1" value={redeemPoints} onChange={e=>setRedeemPoints(Number(e.target.value)||0)} disabled={busy} aria-label="Redeem loyalty points"/></label>}
      <p className="text-xs text-[#937b6f]">Points are reserved only after order placement and refunded if the order is cancelled. New points are earned only after completion.</p>
    </>}
  </div>}
  {approvedQuote&&<div className="summary-line text-green-700"><span>Coupon savings</span><strong>−{money(approvedQuote.discount)}</strong></div>}
  {rewardDiscount>0&&<div className="summary-line text-green-700"><span>Rewards savings ({approvedPoints} points)</span><strong>−{money(rewardDiscount)}</strong></div>}
  <div className="summary-line total-line"><span>{t.total}</span><strong>{money(subtotal+deliveryFee-(approvedQuote?.discount??0)-rewardDiscount)}</strong></div><p className="mt-5 text-xs text-[#927f73]">Final prices, coupons, point balances and delivery fees are recomputed in Postgres. Coupon previews may change before order submission.</p></aside>
    </form>
  </section>;
}
