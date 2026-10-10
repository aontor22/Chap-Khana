import type { FormEvent } from 'react';
import { CalendarClock, Check, ExternalLink, MapPin, Megaphone, Phone, Settings2 } from 'lucide-react';
import type { DayKey, StoreSettings } from '../types';
import { WEEK_DAYS, formatHours, safeExternalUrl, validateRestaurantSettings } from '../lib/storeProfile';

type Props={
  settings:StoreSettings;
  onChange:(settings:StoreSettings)=>void;
  onSave:(event:FormEvent<HTMLFormElement>)=>void;
  busy:boolean;
};
const dayTitle=(day:DayKey)=>day[0].toUpperCase()+day.slice(1);
export default function RestaurantSettingsForm({settings,onChange,onSave,busy}:Props){
  const edit=<K extends keyof StoreSettings>(key:K,value:StoreSettings[K])=>onChange({...settings,[key]:value});
  const editHours=(day:DayKey,key:'open'|'close'|'closed',value:string|boolean)=>onChange({...settings,weekly_hours:{...settings.weekly_hours,[day]:{...settings.weekly_hours[day],[key]:value}}});
  const error=validateRestaurantSettings(settings);
  return <form onSubmit={onSave} className="space-y-6 mt-9 max-w-4xl">
    <section className="panel p-5 sm:p-8 space-y-5" aria-labelledby="operations-heading">
      <div><h2 id="operations-heading" className="font-bold text-2xl flex items-center gap-2"><Settings2 className="text-ember"/> Order operations</h2><p className="text-sm text-[#8b7667] mt-2">Online orders are managed separately from the public opening hours. Do not enable orders before confirming your menu and staff availability.</p></div>
      {([['accepting_orders','Accept online orders'],['pickup_enabled','Offer takeaway / pickup'],['delivery_enabled','Offer restaurant delivery'],['dine_in_enabled','Dine-in available']] as const).map(([key,label])=><label key={key} className="switch-row"><span>{label}</span><input type="checkbox" checked={settings[key]} onChange={e=>edit(key,e.target.checked)}/></label>)}
      <label className="field max-w-xs">Delivery fee (৳)<input type="number" min="0" max="5000" step="1" value={settings.delivery_fee} onChange={e=>edit('delivery_fee',Number(e.target.value))}/></label>
    </section>
    <section className="panel p-5 sm:p-8 space-y-5" aria-labelledby="contact-heading">
      <div><h2 id="contact-heading" className="font-bold text-2xl flex items-center gap-2"><Phone className="text-ember"/> Contact & social media</h2><p className="text-sm text-[#8b7667] mt-2">These details appear in the header, homepage and footer. Keep phone and address up to date.</p></div>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="field">Public phone *<input type="tel" required maxLength={24} value={settings.contact_phone} onChange={e=>edit('contact_phone',e.target.value)} placeholder="01870-203065"/></label>
        <label className="field">WhatsApp (optional)<input type="tel" maxLength={24} value={settings.whatsapp_phone} onChange={e=>edit('whatsapp_phone',e.target.value)} placeholder="01XXXXXXXXX"/></label>
      </div>
      <label className="field">Restaurant address *<textarea required rows={2} maxLength={250} value={settings.address_text} onChange={e=>edit('address_text',e.target.value)}/></label>
      <label className="field">Google Maps URL *<input type="url" required maxLength={500} value={settings.maps_url} onChange={e=>edit('maps_url',e.target.value)}/></label>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="field">Facebook Page<input type="url" maxLength={500} value={settings.facebook_url} onChange={e=>edit('facebook_url',e.target.value)} placeholder="https://www.facebook.com/chapkhana"/></label>
        <label className="field">Instagram (optional)<input type="url" maxLength={500} value={settings.instagram_url} onChange={e=>edit('instagram_url',e.target.value)} placeholder="https://www.instagram.com/..."/></label>
      </div>
      {safeExternalUrl(settings.maps_url)&&<a href={settings.maps_url} target="_blank" rel="noopener noreferrer" className="text-sm text-ember font-bold inline-flex items-center gap-2"><MapPin size={16}/> Preview Maps link <ExternalLink size={14}/></a>}
    </section>
    <section className="panel p-5 sm:p-8" aria-labelledby="hours-heading">
      <h2 id="hours-heading" className="font-bold text-2xl flex items-center gap-2"><CalendarClock className="text-ember"/> Weekly opening hours</h2>
      <p className="text-sm text-[#8b7667] mt-2 mb-5">Asia/Dhaka (Bangladesh time). Enter the published schedule below. Hours are informational; online ordering still follows the Accept online orders switch.</p>
      <div className="mb-4 flex justify-end"><button type="button" className="btn-secondary !py-2" onClick={()=>onChange({...settings,weekly_hours:Object.fromEntries(WEEK_DAYS.map(d=>[d,{...settings.weekly_hours.monday}])) as StoreSettings['weekly_hours']})}>Apply Monday hours to all days</button></div>
      <div className="space-y-3">
        {WEEK_DAYS.map(day=><div key={day} className="hours-edit-row">
          <div className="flex items-center justify-between gap-2"><label className="font-bold text-sm capitalize" htmlFor={`closed-${day}`}>{dayTitle(day)}</label><label className="text-xs flex gap-2 items-center cursor-pointer"><input id={`closed-${day}`} type="checkbox" checked={settings.weekly_hours[day].closed} onChange={e=>editHours(day,'closed',e.target.checked)}/> Closed</label></div>
          <div className="grid grid-cols-2 gap-2 mt-3"><label className="field">Opens<input type="time" required={!settings.weekly_hours[day].closed} disabled={settings.weekly_hours[day].closed} value={settings.weekly_hours[day].open} onChange={e=>editHours(day,'open',e.target.value)}/></label><label className="field">Closes<input type="time" required={!settings.weekly_hours[day].closed} disabled={settings.weekly_hours[day].closed} value={settings.weekly_hours[day].close} onChange={e=>editHours(day,'close',e.target.value)}/></label></div>
          <p className="text-[#968376] text-xs mt-2">{formatHours(settings.weekly_hours[day])}</p>
        </div>)}
      </div>
      <p className="mt-5 text-xs text-[#7b6e63]">For temporary closures, use the announcement below and pause online orders manually if necessary.</p>
    </section>
    <section className="panel p-5 sm:p-8 space-y-5" aria-labelledby="announcement-heading">
      <h2 id="announcement-heading" className="font-bold text-2xl flex items-center gap-2"><Megaphone className="text-ember"/> Public notices</h2>
      <label className="field">Special announcement (optional)<textarea rows={2} maxLength={240} value={settings.announcement} onChange={e=>edit('announcement',e.target.value)} placeholder="E.g. We will be closed on Eid day."/><span className="text-right text-xs text-[#987e70]">{settings.announcement.length}/240</span></label>
      <label className="field">Hours note (optional)<textarea rows={2} maxLength={300} value={settings.hours_note} onChange={e=>edit('hours_note',e.target.value)} placeholder="Holiday hours may vary; call to confirm."/></label>
    </section>
    {error&&<div role="alert" className="notice-error">{error}</div>}
    <div className="flex flex-wrap gap-4 items-center"><button className="btn-primary" type="submit" disabled={busy||Boolean(error)}><Check size={18}/>{busy?'Saving...':'Save restaurant settings'}</button><span className="text-xs text-[#8b7667]">Changes become visible across the site after save.</span></div>
  </form>;
}
