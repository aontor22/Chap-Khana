import { Link, useLocation } from 'react-router-dom';
import { BadgeCheck, ClipboardCopy, ClipboardList, MapPin, Phone, Printer, ShoppingBag, ArrowRight, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { money } from '../lib/utils';
import { loadReceipt, privateTrackingPath, validSavedReceipt } from '../lib/orderReceipt';

export default function OrderConfirmation(){
  const {t,locale,settings}=useShop();
  const route=useLocation();
  const [receipt]=useState(()=>{const pending:unknown=(route.state as {receipt?:unknown}|null)?.receipt;return validSavedReceipt(pending)?pending:loadReceipt();});
  const [copyError,setCopyError]=useState('');
  if(!receipt) return <section className="site-wrap page-pad max-w-2xl"><div className="panel p-8 sm:p-12 text-center"><ClipboardList className="mx-auto text-ember" size={45}/><h1 className="text-3xl font-extrabold mt-5">{locale==='bn'?'এই ট্যাবে কোনো সাম্প্রতিক অর্ডার নেই':'No recent confirmation in this tab'}</h1><p className="text-[#807267] mt-3">{locale==='bn'?'আগের অর্ডার খুঁজতে আপনার ব্যক্তিগত tracking link ব্যবহার করুন।':'Use your private tracking link to find an earlier order.'}</p><Link to="/track" className="btn-primary inline-flex mt-7">{t.trackNow}<ArrowRight size={17}/></Link></div></section>;
  const trackingPath=privateTrackingPath(receipt.tracking_token);
  const trackingUrl=`${window.location.origin}${trackingPath}`;
  const copy=async()=>{
    try {await navigator.clipboard.writeText(trackingUrl);setCopyError(locale==='bn'?'ট্র্যাকিং লিংক কপি হয়েছে':'Private tracking link copied');}
    catch{setCopyError(locale==='bn'?'কপি করা যায়নি; Track order খুলে লিংক কপি করুন।':'Could not copy. Open Track Order and copy the address.');}
  };
  return <section className="site-wrap page-pad max-w-3xl">
    <div className="panel p-6 sm:p-12 text-center receipt-customer">
      <span className="success-icon"><BadgeCheck size={40}/></span>
      <div className="section-kicker justify-center">{receipt.demo?'DEMO ORDER':'ORDER RECEIVED'}</div>
      <h1 className="text-3xl sm:text-5xl font-extrabold mt-4">{t.success}</h1>
      <p className="mt-4 text-[#74675f] max-w-xl mx-auto">{receipt.demo?t.demoSuccess:t.liveSuccess}</p>
      <div className="receipt-summary !max-w-xl">
        <div className="summary-line"><span>{locale==='bn'?'অর্ডার নম্বর':'Order reference'}</span><strong className="break-all">{receipt.code}</strong></div>
        <div className="summary-line"><span>{t.type}</span><strong>{receipt.type==='pickup'?t.pickup:t.delivery}</strong></div>
        <div className="summary-line"><span>{locale==='bn'?'তারিখ':'Placed at'}</span><strong>{new Date(receipt.savedAt).toLocaleString(locale==='bn'?'bn-BD':'en-BD',{timeZone:'Asia/Dhaka'})}</strong></div>
        {receipt.lines.length>0&&<div className="border-t border-[#e0d0c0] mt-3 pt-4"><p className="font-bold mb-2">{t.review}</p>{receipt.lines.map((line,index)=><div className="summary-line" key={`${line.name}-${index}`}><span>{line.name}</span><strong>×{line.qty}</strong></div>)}</div>}
        <div className="summary-line total-line"><span>{t.total}</span><strong>{money(receipt.total)}</strong></div>
        <p className="text-xs text-[#897568] mt-3"><ShieldCheck size={13} className="inline mr-1"/>{locale==='bn'?'ট্র্যাকিং লিংকটি ব্যক্তিগত; অন্যদের সঙ্গে শেয়ার করবেন না।':'Your tracking link is private. Do not post it publicly.'}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3 mt-8 no-print">
        <Link to={trackingPath} className="btn-primary">{t.trackNow}<ArrowRight size={17}/></Link>
        <button type="button" className="btn-secondary" onClick={()=>void copy()}><ClipboardCopy size={17}/>{t.copy}</button>
        <button type="button" className="btn-secondary" onClick={()=>window.print()}><Printer size={17}/>{locale==='bn'?'রসিদ প্রিন্ট':'Print receipt'}</button>
      </div>
      {copyError&&<p role="status" className="text-sm text-[#795543] mt-4 no-print">{copyError}</p>}
      <div className="flex flex-wrap items-center justify-center gap-5 text-sm mt-8 no-print">
        <Link className="inline-flex items-center gap-2 text-ember font-bold" to="/menu"><ShoppingBag size={16}/>{t.browse}</Link>
        {settings.contact_phone&&<a href={`tel:${settings.contact_phone.replace(/[^+\d]/g,'')}`} className="inline-flex items-center gap-2 text-ember font-bold"><Phone size={16}/>{t.call}</a>}
        {receipt.type==='pickup'&&settings.maps_url&&<a href={settings.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-ember font-bold"><MapPin size={16}/>{t.directions}</a>}
      </div>
    </div>
  </section>;
}
