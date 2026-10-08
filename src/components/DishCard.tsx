import { useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { money, validImage } from '../lib/utils';
import type { MenuItem } from '../types';
export function DishImage({item,large=false}:{item:MenuItem;large?:boolean}) {
  const [failed,setFailed]=useState(false);
  return <div className={`dish-image ${large?'h-full':''}`}>{!failed&&validImage(item.image_url) ? <img src={item.image_url} alt={`Illustrative photo for ${item.name}`} loading="lazy" onError={()=>setFailed(true)}/> : <div className={`dish-fallback dish-fallback-${item.category}`}><img src="/brand/chap-khana-logo.png" alt="" aria-hidden="true" className="dish-brand-watermark"/><span className="dish-fallback-title">{item.name_bn || item.name}</span><small>চাপ খানা • CHAP KHANA</small></div>}</div>;
}
export default function DishCard({item}:{item:MenuItem}) {
  const {locale,t,add,settings}=useShop();const canOrder=Boolean(item.price&&item.available&&settings.accepting_orders);
  return <article className="dish-card group"><div className="relative overflow-hidden"><DishImage item={item}/>{item.badge&&<span className="dish-badge">✳ {item.badge}</span>}<div className="absolute bottom-4 right-4 transition-transform group-hover:translate-x-1"><ArrowUpRight size={24} className="text-white drop-shadow-lg"/></div></div>
    <div className="px-5 py-5"><div className="eyebrow mb-2">{t[item.category]}</div><h3 className="font-bold text-xl tracking-tight text-ink">{locale==='bn'?(item.name_bn||item.name):item.name}</h3><p className="text-sm text-[#80746e] mt-2 min-h-[42px] leading-relaxed">{locale==='bn'?(item.description_bn||item.description):item.description}</p><div className="flex items-center justify-between gap-2 pt-5 mt-4 border-t border-[#f0e6dc]"><span className="font-extrabold text-xl">{item.price!==null?money(item.price):t.price}</span><button type="button" className="add-btn" onClick={()=>add(item.id)} disabled={!canOrder} aria-label={`${t.add}: ${item.name}`}><Plus size={17}/><span>{canOrder?t.add:item.price===null?t.price:!item.available?t.unavailable:t.closed}</span></button></div></div>
  </article>;
}
