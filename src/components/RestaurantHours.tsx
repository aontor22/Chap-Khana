import { Clock3 } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { WEEK_DAYS, formatHours, getConfiguredHoursStatus } from '../lib/storeProfile';

const DAY_BN:Record<string,string>={monday:'সোমবার',tuesday:'মঙ্গলবার',wednesday:'বুধবার',thursday:'বৃহস্পতিবার',friday:'শুক্রবার',saturday:'শনিবার',sunday:'রবিবার'};
export default function RestaurantHours({compact=false}:{compact?:boolean}){
  const {settings,locale}=useShop();
  const {day,openNow}=getConfiguredHoursStatus(settings);
  return <div className="restaurant-hours">
    <div className="flex flex-wrap items-center gap-2"><Clock3 size={19} className="text-ember"/><strong>{locale==='bn'?'খোলার সময়':'Opening hours'}</strong><span className="text-xs text-[#7b6c5e]">(Bangladesh time)</span><span className={`hours-status ${openNow?'hours-open':'hours-closed'}`}>{locale==='bn'?(openNow?'সময়সূচি অনুযায়ী খোলা':'সময়সূচি অনুযায়ী বন্ধ'):(openNow?'Scheduled open':'Scheduled closed')}</span></div>
    <div className="mt-4 space-y-2">{WEEK_DAYS.map(d=><div key={d} className={`flex gap-3 justify-between text-sm ${day===d?'font-bold text-[#2c211b]':'text-[#74645a]'}`}><span>{locale==='bn'?DAY_BN[d]:d[0].toUpperCase()+d.slice(1)}{day===d?' •':''}</span><span>{formatHours(settings.weekly_hours[d],locale)}</span></div>)}</div>
    {!compact&&settings.hours_note&&<p className="text-xs text-[#8b7768] mt-3 leading-5">{settings.hours_note}</p>}
  </div>;
}
