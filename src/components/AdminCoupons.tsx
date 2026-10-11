import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BadgePercent, CheckCircle2, PlusCircle, RefreshCw, X } from 'lucide-react';
import { getCoupons, saveCouponCampaign } from '../data/api';
import { type CouponCampaign, normalizeCouponCode, validateCouponCampaign } from '../lib/coupons';
import { money, waitError } from '../lib/utils';

const blank=():CouponCampaign=>({code:'',discount_type:'percent',discount_value:10,min_subtotal:0,max_discount:null,max_uses:null,used_count:0,active:false,starts_at:null,ends_at:null});
const dateField=(iso:string|null)=>{if(!iso)return '';const d=new Date(iso);
  return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const dateValue=(value:string)=>value?new Date(value).toISOString():null;
export default function AdminCoupons({live}:{live:boolean}){
  const [campaigns,setCampaigns]=useState<CouponCampaign[]>([]);
  const [editor,setEditor]=useState<CouponCampaign|null>(null);
  const [editingCode,setEditingCode]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=useCallback(async()=>{setBusy(true);setError('');try{setCampaigns(await getCoupons());}catch(e){setError(waitError(e));}finally{setBusy(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const change=<K extends keyof CouponCampaign>(key:K,value:CouponCampaign[K])=>setEditor(c=>c?{...c,[key]:value}:null);
  const save=async(e:FormEvent)=>{e.preventDefault();if(!editor||busy)return;const clean={...editor,code:normalizeCouponCode(editor.code)};
    const reason=validateCouponCampaign(clean);if(reason){setError(reason);return;}
    setBusy(true);setError('');setNotice('');
    try{await saveCouponCampaign(clean,Boolean(editingCode));setEditor(null);setEditingCode(null);setCampaigns(await getCoupons());setNotice('Coupon campaign saved.');}
    catch(e){setError(waitError(e));}finally{setBusy(false);}
  };
  return <section className="mt-8 space-y-5" aria-label="Coupon campaign management" data-testid="admin-coupons">
    <div className="panel p-6"><div className="flex flex-wrap gap-3 items-center justify-between"><div><h2 className="text-2xl font-extrabold flex gap-2 items-center"><BadgePercent size={24}/> Coupon campaigns</h2><p className="text-sm text-[#857367] mt-2">Cart-level offers on top of item discounts. Backend enforces limits and final prices.</p></div><div className="flex gap-2"><button type="button" onClick={()=>void load()} className="btn-secondary" disabled={busy}><RefreshCw size={16}/> Refresh</button><button type="button" className="btn-primary" onClick={()=>{setEditingCode(null);setEditor(blank());setError('');}}><PlusCircle size={16}/> New coupon</button></div></div>
      {!live&&<p className="notice mt-5">Demo-only campaigns are saved in this browser. DEMO10 is available for testing.</p>}
      {notice&&<p role="status" className="mt-4 text-green-700 flex gap-2 items-center"><CheckCircle2 size={16}/>{notice}</p>}
      {error&&<p role="alert" className="notice-error mt-4">{error}{error.includes('coupon_campaigns')&&' — Apply SQL migration 12 before using live coupons.'}</p>}
    </div>
    <div className="panel overflow-x-auto"><table className="admin-table"><thead><tr><th>Code</th><th>Offer</th><th>Min. basket</th><th>Redemptions</th><th>Status</th><th/></tr></thead><tbody>
      {campaigns.map(c=><tr key={c.code}><td className="font-bold tracking-wide">{c.code}</td><td>{c.discount_type==='percent'?`${c.discount_value}%`:money(c.discount_value)}{c.max_discount?` · max ${money(c.max_discount)}`:''}</td><td>{money(c.min_subtotal)}</td><td>{c.used_count}/{c.max_uses??'∞'}</td><td>{c.active?'Enabled':'Disabled'}</td><td><button type="button" className="btn-secondary !py-2" onClick={()=>{setEditor({...c});setEditingCode(c.code);setError('');}}>Edit</button></td></tr>)}
      {!campaigns.length&&<tr><td colSpan={6}>No campaigns yet. Create one to offer a coupon at checkout.</td></tr>}
    </tbody></table></div>
    {editor&&<div className="modal-backdrop" role="presentation" onClick={()=>!busy&&setEditor(null)}><div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Coupon editor" onClick={e=>e.stopPropagation()}>
      <div className="flex justify-between items-center mb-4"><h3 className="font-extrabold text-xl">{editingCode?'Edit coupon':'New coupon'}</h3><button aria-label="Close" disabled={busy} onClick={()=>setEditor(null)}><X size={22}/></button></div>
      <form onSubmit={e=>void save(e)} className="space-y-4">
        <label className="field">Coupon code<input value={editor.code} disabled={Boolean(editingCode)} maxLength={24} required onChange={e=>change('code',normalizeCouponCode(e.target.value))} placeholder="WELCOME10"/></label>
        <div className="grid sm:grid-cols-2 gap-4"><label className="field">Discount type<select value={editor.discount_type} onChange={e=>change('discount_type',e.target.value as CouponCampaign['discount_type'])}><option value="percent">Percentage</option><option value="fixed">Fixed BDT</option></select></label><label className="field">Discount value<input required min={1} max={editor.discount_type==='percent'?99:999999} type="number" step="1" value={editor.discount_value} onChange={e=>change('discount_value',Number(e.target.value))}/></label></div>
        <div className="grid sm:grid-cols-2 gap-4"><label className="field">Minimum basket (৳)<input type="number" min={0} max={999999} value={editor.min_subtotal} onChange={e=>change('min_subtotal',Number(e.target.value))}/></label><label className="field">Maximum discount (৳, optional)<input type="number" min={1} value={editor.max_discount??''} onChange={e=>change('max_discount',e.target.value===''?null:Number(e.target.value))}/></label></div>
        <label className="field">Total redemptions allowed (optional)<input type="number" min={1} value={editor.max_uses??''} onChange={e=>change('max_uses',e.target.value===''?null:Number(e.target.value))}/></label>
        <div className="grid sm:grid-cols-2 gap-4"><label className="field">Starts (optional)<input type="datetime-local" value={dateField(editor.starts_at)} onChange={e=>change('starts_at',dateValue(e.target.value))}/></label><label className="field">Ends (optional)<input type="datetime-local" value={dateField(editor.ends_at)} onChange={e=>change('ends_at',dateValue(e.target.value))}/></label></div>
        <label className="inline-flex gap-3 items-center"><input type="checkbox" checked={editor.active} onChange={e=>change('active',e.target.checked)}/> Enable coupon</label>
        <p className="text-xs text-[#917f70]">Uses are counted when orders are placed, including orders later cancelled. Existing order amounts never change.</p>
        {error&&<p className="notice-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full justify-center">{busy?'Saving…':'Save campaign'}</button>
      </form></div></div>}
  </section>;
}
