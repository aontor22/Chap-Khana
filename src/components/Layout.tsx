import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowRight, Clock3, Facebook, Instagram, LayoutDashboard, MapPin, Menu, MessageCircle, Phone, ShoppingBag, X } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { getConfiguredHoursStatus, phoneHref, safeExternalUrl, whatsappHref } from '../lib/storeProfile';
import RestaurantHours from './RestaurantHours';

const NavItem=({to,children,onClick}:{to:string;children:ReactNode;onClick?:()=>void})=><NavLink to={to} onClick={onClick} className={({isActive})=>`nav-link ${isActive?'nav-link-active':''}`}>{children}</NavLink>;
export default function Layout({children}:{children:ReactNode}) {
  const {t,locale,setLocale,count,live,alert,user,adminStatus,settings}=useShop();const [mobile,setMobile]=useState(false);
  const phone=phoneHref(settings.contact_phone);const fb=safeExternalUrl(settings.facebook_url);const instagram=safeExternalUrl(settings.instagram_url);const maps=safeExternalUrl(settings.maps_url);const whatsApp=whatsappHref(settings.whatsapp_phone);
  const openNow=getConfiguredHoursStatus(settings).openNow;
  const showAdmin=adminStatus==='allowed'&&(Boolean(user)||!live);
  return <div className="min-h-screen flex flex-col">
    <div className="top-ribbon"><div className="site-wrap flex items-center justify-between gap-4"><span className="flex items-center gap-1.5"><MapPin size={11}/> KHILKHET, DHAKA</span><span>{live?'CONNECTED • CHECK STORE AVAILABILITY':'DEMO MODE • ORDERS ARE NOT SENT'}</span>{phone&&<a href={phone} className="hidden sm:inline-flex items-center gap-2"><Phone size={11}/>{settings.contact_phone}</a>}</div></div>
    <header className="site-header"><div className="site-wrap flex items-center justify-between min-h-[74px] gap-4">
      <Link to="/" className="brand-link shrink-0" aria-label="চাপ খানা — Chap Khana home"><img className="brand-logo" src="/brand/chap-khana-logo.png" alt="চাপ খানা (Chap Khana) logo" width="192" height="64"/></Link>
      <nav className="hidden lg:flex gap-8 items-center"><NavItem to="/menu">{t.menu}</NavItem><a href="/#story" className="nav-link">{t.story}</a><a href="/#find-us" className="nav-link">{t.location}</a><NavItem to="/track">{t.track}</NavItem><NavItem to="/account">{user?.user_metadata?.full_name?.split(' ')[0]||t.account}</NavItem></nav>
      <div className="flex items-center gap-2">{showAdmin&&<Link to="/admin" className="admin-shortcut hidden md:inline-flex" aria-label={t.admin} title={t.admin}><LayoutDashboard size={17}/><span>{t.adminShort}</span></Link>}<button className="language" onClick={()=>setLocale(locale==='en'?'bn':'en')} aria-label="Change language">{locale==='en'?'বাংলা':'EN'}</button><Link to="/cart" className="cart-header"><ShoppingBag size={18}/><span className="hidden sm:inline">{t.cart}</span><span className="cart-counter">{count}</span></Link><button className="lg:hidden p-2" aria-label="Toggle navigation" onClick={()=>setMobile(!mobile)}>{mobile?<X size={23}/>:<Menu size={23}/>}</button></div>
    </div>{mobile&&<nav className="mobile-nav"><NavItem to="/menu" onClick={()=>setMobile(false)}>{t.menu}</NavItem><NavItem to="/account" onClick={()=>setMobile(false)}>{t.account}</NavItem><NavItem to="/track" onClick={()=>setMobile(false)}>{t.track}</NavItem>{showAdmin&&<NavItem to="/admin" onClick={()=>setMobile(false)}><span className="inline-flex items-center gap-2"><LayoutDashboard size={17}/>{t.admin}</span></NavItem>}<a href="/#find-us" onClick={()=>setMobile(false)}>{t.location}</a>{fb&&<a href={fb} target="_blank" rel="noopener noreferrer" onClick={()=>setMobile(false)}><span className="inline-flex gap-2 items-center"><Facebook size={17}/>Facebook</span></a>}</nav>}</header>
    {settings.announcement.trim()&&<div className="public-announcement" role="status">{settings.announcement}</div>}
    {!live&&<div className="demo-banner">✳ &nbsp; This is a portfolio demonstration. Menu prices are transcribed from user-supplied photos; checkout is local-only. &nbsp; <span>Not connected to the restaurant.</span></div>}
    <main className="flex-1">{children}</main>
    <footer className="footer"><div className="site-wrap py-14 grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
      <div><Link to="/" className="footer-brand" aria-label="Chap Khana home"><img src="/brand/chap-khana-logo.png" alt="চাপ খানা — Chap Khana" width="232" height="77" loading="lazy"/></Link><p className="max-w-[330px] text-[#bda99b] text-sm leading-7 mt-4">Fresh flavours, friendly moments. Good food for good company in Khilkhet, Dhaka.</p><p className="text-xs text-[#8b7567] mt-5">Brand logo recreated from printed menu photos. All menu prices and availability require owner confirmation.</p></div>
      <div className="footer-links"><h4>Explore</h4><Link to="/menu">Our menu</Link><Link to="/track">Track an order</Link><Link to="/account">My orders</Link>{showAdmin&&<Link to="/admin">{t.admin}</Link>}</div>
      <div className="footer-links"><h4>Get in touch</h4>
        {phone&&<a href={phone}>{settings.contact_phone}</a>}
        <span>{settings.address_text}</span>
        {maps&&<a className="inline-flex items-center gap-1" href={maps} target="_blank" rel="noopener noreferrer">Google Maps <ArrowRight size={14}/></a>}
        <div className="flex flex-wrap gap-3 mt-2">
          {fb&&<a href={fb} aria-label="Chap Khana Facebook" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5"><Facebook size={18}/>Facebook</a>}
          {instagram&&<a href={instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5"><Instagram size={18}/>Instagram</a>}
          {whatsApp&&<a href={whatsApp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5"><MessageCircle size={18}/>WhatsApp</a>}
        </div>
        <div className="flex items-center gap-2 text-xs text-[#dac3b1] mt-3"><Clock3 size={15}/>{openNow?'Scheduled open':'Scheduled closed'} · Asia/Dhaka</div>
      </div>
      <div className="md:col-span-3 border-t border-white/10 pt-7 mt-1"><div className="max-w-xl rounded-xl bg-[#fff8f0] text-[#35261d] p-5 sm:p-6"><RestaurantHours compact/>{settings.hours_note&&<p className="text-xs mt-3 text-[#75665a]">{settings.hours_note}</p>}</div></div>
    </div><div className="site-wrap border-t border-white/10 py-5 text-[#947e70] text-xs flex flex-wrap justify-between gap-3"><span>© {new Date().getFullYear()} Chap Khana website concept.</span><span>Pay cash at pickup/delivery · No online payment processed</span></div></footer>
    {alert&&<div className="toast" role="status">{alert}</div>}
  </div>;
}
