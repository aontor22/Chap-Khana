import type { DayKey, OpeningHours, StoreSettings, WeeklyHours } from '../types';

export const WEEK_DAYS: readonly DayKey[] = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
export const LOCAL_TIME_ZONE = 'Asia/Dhaka';
export const DEFAULT_WEEKLY_HOURS: WeeklyHours = Object.fromEntries(
  WEEK_DAYS.map(day=>[day,{open:'11:59',close:'23:59',closed:false}])
) as unknown as WeeklyHours;
export const DEFAULT_PROFILE = {
  contact_phone:'01870-203065',
  whatsapp_phone:'',
  address_text:'Namapara Road, Khilkhet, Dhaka',
  maps_url:'https://maps.app.goo.gl/gjk9EttHXfm8X51v6',
  facebook_url:'https://www.facebook.com/chapkhana',
  instagram_url:'',
  hours_note:'Opening hours shown are from the supplied Google Maps listing; please confirm before visiting.',
  announcement:'',
  dine_in_enabled:true,
  weekly_hours:DEFAULT_WEEKLY_HOURS,
};

const timeRE=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const validDay=(v:unknown):v is OpeningHours=>!!v&&typeof v==='object'&&
  typeof (v as OpeningHours).closed==='boolean'&&
  typeof (v as OpeningHours).open==='string'&&timeRE.test((v as OpeningHours).open)&&
  typeof (v as OpeningHours).close==='string'&&timeRE.test((v as OpeningHours).close);

export function normalizeStoreSettings(value: Partial<StoreSettings> | null | undefined): StoreSettings {
  const input=value??{};
  const raw=input.weekly_hours;
  const weekly_hours=Object.fromEntries(WEEK_DAYS.map(day=>[
    day,raw&&validDay(raw[day]) ? {...raw[day]} : {...DEFAULT_WEEKLY_HOURS[day]}
  ])) as WeeklyHours;
  return {
    id:1, accepting_orders:false,pickup_enabled:true,delivery_enabled:false,delivery_fee:0,
    ...DEFAULT_PROFILE,...input,weekly_hours
  };
}

export function safeExternalUrl(value:string): string | null {
  try {const parsed=new URL(value);return parsed.protocol==='https:'?parsed.toString():null;} catch{return null;}
}
export function phoneHref(value:string):string | null {
  const cleaned=value.replace(/[\s()-]/g,'');
  return /^\+?[0-9]{7,16}$/.test(cleaned)?`tel:${cleaned}`:null;
}
export function whatsappHref(value:string):string|null {
  if(!value.trim())return null;
  let cleaned=value.replace(/[^\d]/g,'');
  if(/^01[3-9]\d{8}$/.test(cleaned))cleaned=`88${cleaned}`;
  if(!/^\d{10,15}$/.test(cleaned))return null;
  return `https://wa.me/${cleaned}`;
}
const minutes=(time:string)=>{const [h,m]=time.split(':').map(Number);return h*60+m;};
export function formatOpeningTime(value:string,locale:'en'|'bn'='en') {
  if(!timeRE.test(value))return value;
  const [h,m]=value.split(':').map(Number);
  const hour=h%12||12;
  const formatted=`${hour}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`;
  return locale==='bn'?formatted.replace(/\d/g,d=>'০১২৩৪৫৬৭৮৯'[Number(d)]):formatted;
}
export function formatHours(day:OpeningHours,locale:'en'|'bn'='en'){
  if(day.closed)return locale==='bn'?'বন্ধ':'Closed';
  return `${formatOpeningTime(day.open,locale)} – ${formatOpeningTime(day.close,locale)}`;
}

// This is an informational indicator based on configured hours, not a real-time
// confirmation that the restaurant is accepting guests or online orders.
export function getConfiguredHoursStatus(settings:StoreSettings, now:Date=new Date()):{day:DayKey;openNow:boolean;today:OpeningHours}{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:LOCAL_TIME_ZONE,weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const day=parts.find(p=>p.type==='weekday')!.value.toLowerCase() as DayKey;
  const clock=(Number(parts.find(p=>p.type==='hour')?.value)||0)*60+(Number(parts.find(p=>p.type==='minute')?.value)||0);
  const today=settings.weekly_hours[day]||DEFAULT_WEEKLY_HOURS[day];
  const index=WEEK_DAYS.indexOf(day);
  const previous=settings.weekly_hours[WEEK_DAYS[(index+6)%7]];
  const previousOvernight=previous&&!previous.closed&&minutes(previous.close)<minutes(previous.open)&&clock<minutes(previous.close);
  const own=!today.closed&& (minutes(today.close)>minutes(today.open)
    ? clock>=minutes(today.open)&&clock<minutes(today.close)
    : minutes(today.close)<minutes(today.open)
      ? clock>=minutes(today.open)
      : clock>=minutes(today.open));
  return {day,today,openNow:Boolean(own||previousOvernight)};
}
export function validateRestaurantSettings(s:StoreSettings):string|null {
  if(!s.pickup_enabled&&!s.delivery_enabled)return 'Enable pickup or delivery.';
  if(!Number.isInteger(s.delivery_fee)||s.delivery_fee<0||s.delivery_fee>5000)return 'Delivery fee must be between ৳0 and ৳5000.';
  if(!/^\+?[0-9()\-\s]{7,24}$/.test(s.contact_phone))return 'Enter a valid restaurant phone number.';
  if(s.whatsapp_phone && !whatsappHref(s.whatsapp_phone))return 'Enter a valid WhatsApp number or leave it blank.';
  if(!s.address_text.trim()||s.address_text.length>250)return 'Address is required (maximum 250 characters).';
  const urls=[['Google Maps',s.maps_url],['Facebook',s.facebook_url],['Instagram',s.instagram_url]] as const;
  for(const [label,url] of urls){if(url && (!safeExternalUrl(url)||url.length>500))return `${label} must be a valid HTTPS URL (maximum 500 characters).`;}
  if(!s.maps_url.trim())return 'Google Maps link is required.';
  if(s.hours_note.length>300||s.announcement.length>240)return 'Hours note or announcement is too long.';
  for(const day of WEEK_DAYS){if(!validDay(s.weekly_hours?.[day]))return `Invalid opening hours for ${day}.`;
    if(!s.weekly_hours[day].closed&&s.weekly_hours[day].open===s.weekly_hours[day].close)return `${day} opening and closing times cannot match.`;
  }
  return null;
}
