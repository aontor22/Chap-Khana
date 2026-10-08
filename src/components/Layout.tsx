import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowRight, Flame, MapPin, Menu, Phone, ShoppingBag, X } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { config } from '../lib/config';

const NavItem=({to,children,onClick}:{to:string;children:ReactNode;onClick?:()=>void})=><NavLink to={to} onClick={onClick} className={({isActive})=>`nav-link ${isActive?'nav-link-active':''}`}>{children}</NavLink>;
export default function Layout({children}:{children:ReactNode}) {
  const {t,locale,setLocale,count,live,alert,user}=useShop();const [mobile,setMobile]=useState(false);
  return <div className="min-h-screen flex flex-col">
    <div className="top-ribbon"><div className="site-wrap flex items-center justify-between gap-4"><span className="flex items-center gap-1.5"><MapPin size={11}/> KHILKHET, DHAKA</span><span>{live?'CONNECTED • CHECK STORE AVAILABILITY':'DEMO MODE • ORDERS ARE NOT SENT'}</span><a href={`tel:${config.phone.replace(/[^0-9+]/g,'')}`} className="hidden sm:inline-flex items-center gap-2"><Phone size={11}/>{config.phone}</a></div></div>
    <header className="site-header"><div className="site-wrap flex items-center justify-between min-h-[74px] gap-4">
      <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="Chap Khana home"><span className="brand-icon"><Flame size={25}/></span><span className="leading-none"><span className="font-extrabold tracking-tight text-[19px]">CHAP <span className="text-ember">KHANA</span></span><small className="block tracking-[0.25em] text-[8px] mt-1 text-gray-500 font-bold">GOOD FOOD. GOOD MOOD.</small></span></Link>
      <nav className="hidden lg:flex gap-8 items-center"><NavItem to="/menu">{t.menu}</NavItem><a href="/#story" className="nav-link">{t.story}</a><a href="/#find-us" className="nav-link">{t.location}</a><NavItem to="/track">{t.track}</NavItem><NavItem to="/account">{user?.user_metadata?.full_name?.split(' ')[0]||t.account}</NavItem></nav>
      <div className="flex items-center gap-2"><button className="language" onClick={()=>setLocale(locale==='en'?'bn':'en')} aria-label="Change language">{locale==='en'?'বাংলা':'EN'}</button><Link to="/cart" className="cart-header"><ShoppingBag size={18}/><span className="hidden sm:inline">{t.cart}</span><span className="cart-counter">{count}</span></Link><button className="lg:hidden p-2" aria-label="Toggle navigation" onClick={()=>setMobile(!mobile)}>{mobile?<X size={23}/>:<Menu size={23}/>}</button></div>
    </div>{mobile&&<nav className="mobile-nav"><NavItem to="/menu" onClick={()=>setMobile(false)}>{t.menu}</NavItem><NavItem to="/account" onClick={()=>setMobile(false)}>{t.account}</NavItem><NavItem to="/track" onClick={()=>setMobile(false)}>{t.track}</NavItem><NavItem to="/admin" onClick={()=>setMobile(false)}>{t.admin}</NavItem><a href="/#find-us" onClick={()=>setMobile(false)}>{t.location}</a></nav>}</header>
    {!live&&<div className="demo-banner">✳ &nbsp; This is a portfolio demonstration. Menu photos/prices are examples and checkout is local-only. &nbsp; <span>Not connected to the restaurant.</span></div>}
    <main className="flex-1">{children}</main>
    <footer className="footer"><div className="site-wrap py-14 grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
      <div><Link to="/" className="text-[24px] font-extrabold tracking-tight">♨ CHAP <span className="text-spice">KHANA</span></Link><p className="max-w-[330px] text-[#bda99b] text-sm leading-7 mt-4">Fresh flavours, friendly moments. Good food for good company in Khilkhet, Dhaka.</p><p className="text-xs text-[#8b7567] mt-5">Illustrative images. Restaurant identity, menu and prices require owner confirmation.</p></div>
      <div className="footer-links"><h4>Explore</h4><Link to="/menu">Our menu</Link><Link to="/track">Track an order</Link><Link to="/account">My orders</Link><Link to="/admin">Staff dashboard</Link></div>
      <div className="footer-links"><h4>Get in touch</h4><a href={`tel:${config.phone}`}>{config.phone}</a><span>{config.address}</span><a className="inline-flex items-center gap-1" href={config.maps} target="_blank" rel="noopener noreferrer">Find us on Maps <ArrowRight size={14}/></a></div>
    </div><div className="site-wrap border-t border-white/10 py-5 text-[#947e70] text-xs flex flex-wrap justify-between gap-3"><span>© {new Date().getFullYear()} Chap Khana website concept.</span><span>Pay cash at pickup/delivery · No online payment processed</span></div></footer>
    {alert&&<div className="toast" role="status">{alert}</div>}
  </div>;
}
