import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Gift, RefreshCw, ShieldCheck } from 'lucide-react';
import { getLoyaltySettings, saveLoyaltySettings } from '../data/api';
import { validateLoyaltySettings, type LoyaltySettings } from '../lib/loyalty';
import { waitError } from '../lib/utils';

export default function AdminLoyalty({live}:{live:boolean}){
  const [rules,setRules]=useState<LoyaltySettings|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState('');
  const load=useCallback(async()=>{setBusy(true);setError('');try{setRules(await getLoyaltySettings());}catch(e){setError(waitError(e));}finally{setBusy(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const update=<K extends keyof LoyaltySettings>(key:K,value:LoyaltySettings[K])=>setRules(prev=>prev?{...prev,[key]:value}:null);
  const save=async(e:FormEvent)=>{e.preventDefault();if(!rules||busy)return;
    const issue=validateLoyaltySettings(rules);if(issue){setError(issue);return;}
    setBusy(true);setError('');setSaved('');
    try{await saveLoyaltySettings(rules);setRules(await getLoyaltySettings());setSaved('Rewards settings saved.');}
    catch(e){setError(waitError(e));}finally{setBusy(false);}
  };
  return <section className="mt-8 space-y-5" aria-label="Loyalty program management" data-testid="admin-loyalty">
    <div className="panel p-6 sm:p-8"><div className="flex justify-between items-start gap-3 flex-wrap"><div><h2 className="font-extrabold text-2xl flex gap-2 items-center"><Gift size={25}/> Customer loyalty rewards</h2><p className="mt-2 text-sm text-[#847369]">Points are credited only when a signed-in customer's order is marked completed. Cancelled orders automatically refund any redeemed points.</p></div><button type="button" onClick={()=>void load()} disabled={busy} className="btn-secondary"><RefreshCw size={16}/> Refresh</button></div>
    {!live&&<p className="notice mt-4">Demo settings are stored in this browser; demo checkouts do not earn or redeem real points.</p>}
    {error&&<p className="notice-error mt-5" role="alert">{error}{error.includes('loyalty_settings')&&' — Apply SQL migration 13.'}</p>}
    {saved&&<p className="text-green-700 mt-5" role="status">{saved}</p>}
    {rules?<form className="mt-6 space-y-5" onSubmit={e=>void save(e)}>
      <label className="flex gap-3 items-center font-bold"><input type="checkbox" checked={rules.enabled} onChange={e=>update('enabled',e.target.checked)}/> Enable loyalty rewards</label>
      <p className="text-xs text-[#8f796c]">Program starts OFF after migration. Existing orders are not rewarded retroactively.</p>
      <div className="grid sm:grid-cols-2 gap-5">
        <label className="field">Points earned per ৳100 of eligible food value<input type="number" min="1" max="50" step="1" required value={rules.points_per_100_bdt} onChange={e=>update('points_per_100_bdt',Number(e.target.value))}/></label>
        <label className="field">Discount value per redeemed point (৳)<input type="number" min="1" max="10" step="1" required value={rules.bdt_per_point} onChange={e=>update('bdt_per_point',Number(e.target.value))}/></label>
        <label className="field">Minimum points to redeem<input type="number" min="1" max="100000" step="1" required value={rules.minimum_redeem_points} onChange={e=>update('minimum_redeem_points',Number(e.target.value))}/></label>
        <label className="field">Maximum reward discount (% of food after other offers)<input type="number" min="1" max="50" step="1" required value={rules.max_redeem_percent} onChange={e=>update('max_redeem_percent',Number(e.target.value))}/></label>
      </div>
      <div className="rounded-xl bg-[#fff7ec] border border-[#f0dcc8] p-4 text-sm leading-7"><strong>Example:</strong> ৳500 eligible food, {rules.points_per_100_bdt} points per ৳100 → {5*rules.points_per_100_bdt} points after completion. Redemption is limited to {rules.max_redeem_percent}% of eligible food value (after item and coupon discounts), excluding delivery charges.</div>
      <button type="submit" className="btn-primary" disabled={busy}>{busy?'Saving…':'Save rewards settings'}</button>
    </form>:!busy&&<p className="mt-6">Could not load rewards settings.</p>}
    <p className="text-xs text-[#927f72] mt-5 flex items-start gap-2"><ShieldCheck size={16}/> Customers can read their own wallet and events, but cannot update balances or issue points. PostgreSQL calculates redemption and earnings.</p>
    </div>
  </section>;
}
