import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Bell, BellOff, Check, ClipboardList, Clock3, LockKeyhole, MenuSquare, PackagePlus, RefreshCw, Settings, ShieldCheck, Truck, Utensils, X } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { changeOrderStatus, getMenu, getSettings, saveMenuItem, saveStoreSettings } from '../data/api';
import { money, waitError } from '../lib/utils';
import { discountedUnitPrice, discountLabel, validateDiscount } from '../lib/discount';
import { DishImage } from '../components/DishCard';
import RestaurantSettingsForm from '../components/RestaurantSettingsForm';
import MenuImageUpload from '../components/MenuImageUpload';
import { uploadMenuImage, deleteManagedMenuImage } from '../lib/menuImageStorage';
import { managedMenuImagePath } from '../lib/menuImageRules';
import { config } from '../lib/config';
import { validImage } from '../lib/utils';
import { validateRestaurantSettings } from '../lib/storeProfile';
import { useAdminOrderAlerts } from '../hooks/useAdminOrderAlerts';
import AdminOrders from '../components/AdminOrders';
import AdminSales from '../components/AdminSales';
import AdminCoupons from '../components/AdminCoupons';
import AdminLoyalty from '../components/AdminLoyalty';
import AdminInventory from '../components/AdminInventory';
import AdminPurchasing from '../components/AdminPurchasing';
import { ORDER_STATUS_LABELS } from '../lib/orderManagement';
import { MENU_CATEGORIES, type Category, type MenuItem, type Order, type OrderStatus, type StoreSettings } from '../types';

type Tab='overview'|'orders'|'menu'|'settings'|'sales'|'coupons'|'loyalty'|'inventory'|'purchasing';
const blank=():MenuItem=>({id:'',category:'chap',name:'',name_bn:'',description:'',description_bn:'',price:null,discount_type:'none',discount_value:0,image_url:'',badge:'',sort_order:100,active:true,available:true});
export default function Admin(){
  const {live,user,authLoading,adminStatus,adminError,refreshAdminAccess,signInGoogle,signInPassword,signOut,notify,refresh:refreshShop,t}=useShop();
  const permitted=adminStatus==='allowed';const checking=authLoading||adminStatus==='checking';const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [authBusy,setAuthBusy]=useState(false);
  const [tab,setTab]=useState<Tab>('overview');
  const {orders, unread, connection, error:orderError, soundEnabled, toggleSound, markRead, refreshOrders} = useAdminOrderAlerts({enabled:permitted,live,userId:user?.id??null});
  const [dishes,setDishes]=useState<MenuItem[]>([]);const [settings,setSettings]=useState<StoreSettings|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [editor,setEditor]=useState<MenuItem|null>(null);const [pendingImage,setPendingImage]=useState<File|null>(null);const settingsDirty=useRef(false);
  const openOrders=()=>{setTab('orders');markRead();};
  const openEditor=(item:MenuItem)=>{setPendingImage(null);setEditor({...item});};
  const closeEditor=()=>{if(busy)return;setPendingImage(null);setEditor(null);};
  const load=useCallback(async()=>{
    if(!permitted)return;try{const [menuData,settingsData]=await Promise.all([getMenu(),getSettings()]);setDishes(menuData);if(!settingsDirty.current)setSettings(settingsData);setError('');}
    catch(e){setError(waitError(e));}
  },[permitted]);
  useEffect(()=>{if(!permitted){setDishes([]);setSettings(null);setEditor(null);settingsDirty.current=false;return;}void load();},[load,permitted]);
  useEffect(()=>{if(!permitted)return;const timer=setInterval(()=>{void load();},20000);return()=>clearInterval(timer);},[permitted,load]);
  const login=async(e:FormEvent)=>{e.preventDefault();setAuthBusy(true);setError('');try{await signInPassword(email,password);}catch(e){setError(waitError(e));}finally{setAuthBusy(false);}};
  const statusUpdate=async(o:Order,s:OrderStatus):Promise<boolean>=>{setBusy(true);try{await changeOrderStatus(o.id,s);notify('Order status updated');await refreshOrders();return true;}catch(e){notify(waitError(e));return false;}finally{setBusy(false);}};
  const saveDish=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!editor || busy)return;
    setBusy(true);
    let uploaded: Awaited<ReturnType<typeof uploadMenuImage>> | null = null;
    let saved=false;
    const slug=editor.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'dish';
    const id=editor.id||`${slug}-${crypto.randomUUID().slice(0,6)}`;
    try{
      if(!editor.name.trim()||editor.name.length>120)throw new Error('Enter a valid dish name.');
      if(editor.price!==null&&(!Number.isInteger(editor.price)||editor.price<1||editor.price>999999))throw new Error('Price must be a whole number between 1 and 999999.');
      const discountError=validateDiscount(editor);if(discountError)throw new Error(discountError);
      if(!pendingImage && editor.image_url && !validImage(editor.image_url))throw new Error('Enter a valid HTTPS image URL or select an upload.');
      // Upload first, then save its public URL to the menu row. On save failure,
      // remove ONLY the newly uploaded object. Old photos remain untouched.
      if(pendingImage){uploaded=await uploadMenuImage(pendingImage,id);}
      const nextItem={...editor,id,image_url:uploaded?.url??editor.image_url};
      await saveMenuItem(nextItem);
      saved=true;
      // Once the database refers to the replacement, clean up the old photo.
      // Third-party / reference URLs can never be deleted.
      const previous=dishes.find(x=>x.id===id)?.image_url;
      if(previous && previous!==nextItem.image_url && managedMenuImagePath(previous,id,config.supabaseUrl)){
        try{await deleteManagedMenuImage(previous,id);}
        catch(cleanupError){console.warn('Old photo cleanup pending',cleanupError);notify('Dish saved; old photo cleanup may need attention in Storage.');}
      }
      if(!previous || previous===nextItem.image_url || !managedMenuImagePath(previous,id,config.supabaseUrl))notify('Dish saved');
      setPendingImage(null);setEditor(null);await load();await refreshShop();
    }catch(e){
      if(uploaded && !saved){try{await deleteManagedMenuImage(uploaded.url,id);}catch(cleanupError){console.warn('Upload rollback cleanup failed',cleanupError);}}
      notify(waitError(e));
    }finally{setBusy(false);}
  };
  const saveSettings=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!settings)return;
    const problem=validateRestaurantSettings(settings);if(problem){notify(problem);return;}
    setBusy(true);try{await saveStoreSettings(settings);settingsDirty.current=false;notify('Restaurant settings saved');await load();await refreshShop();}
    catch(e){notify(waitError(e));}finally{setBusy(false);}};
    const editRestaurantSettings=(value:StoreSettings)=>{settingsDirty.current=true;setSettings(value);};
  const updateEditor=<K extends keyof MenuItem>(key:K,value:MenuItem[K])=>setEditor(prev=>prev?{...prev,[key]:value}:null);
  if(checking||authLoading)return <div className="site-wrap page-pad">Checking secure staff access…</div>;
  if(!permitted)return <section className="site-wrap page-pad max-w-2xl"><Link to="/" className="back-link">← Return to restaurant</Link><div className="panel p-8 sm:p-12 text-center mt-7"><div className="icon-large mx-auto"><LockKeyhole size={30}/></div><h1 className="text-3xl font-bold mt-5">Staff dashboard</h1><p className="text-[#807167] mt-3 mb-8">Only pre-approved staff can access real menu, settings, and customer orders. Google login alone does not grant staff permission.</p>{!live?<div className="notice">Demo access is automatically enabled with no database. Demo edits affect only this browser.</div>:<>{user?<>{adminStatus==='error'?<div className="notice-error mb-5" role="alert">{t.staffLookupError}{adminError?` (${adminError})`:''}<button className="btn-secondary mt-3 mx-auto" onClick={()=>void refreshAdminAccess()}><RefreshCw size={16}/>{t.retry}</button></div>:<div className="notice-error mb-5">Signed in as {user.email}, but not in the staff allowlist.<button className="btn-secondary mt-3 mx-auto" onClick={()=>void refreshAdminAccess()}><RefreshCw size={16}/>{t.recheckStaff}</button></div>}<button className="btn-secondary" onClick={()=>void signOut().catch(e=>setError(waitError(e)))}>Sign out</button></>:<><button className="google-button w-full justify-center" onClick={()=>void signInGoogle('/admin').catch(e=>setError(waitError(e)))}><span className="google-g">G</span>Continue with Google</button><div className="text-xs text-[#ad9e92] my-5">OR SIGN IN WITH STAFF EMAIL</div><form onSubmit={e=>void login(e)} className="space-y-3"><label className="field text-left">Email<input value={email} type="email" autoComplete="username" required onChange={e=>setEmail(e.target.value)}/></label><label className="field text-left">Password<input value={password} type="password" autoComplete="current-password" required onChange={e=>setPassword(e.target.value)}/></label><button disabled={authBusy} className="btn-primary w-full justify-center">{authBusy?'Signing in…':'Sign in'}<ArrowRight size={16}/></button></form></>}{error&&<div className="notice-error mt-5">{error}</div>}</>}</div></section>;
  const pending=orders.filter(o=>o.status==='pending').length;const active=orders.filter(o=>!['completed','cancelled'].includes(o.status)).length;
  return <div className="admin-shell"><aside className="admin-side"><Link to="/" className="inline-block rounded bg-[#1a110e] p-2"><img src="/brand/chap-khana-logo.png" className="w-[165px]" alt="চাপ খানা logo"/></Link><div className="text-[10px] tracking-[.23em] text-[#a9998e] my-10 font-bold">STAFF CONTROL ROOM</div><nav className="space-y-2">{([['overview',BarChart3,t.dashboard],['orders',ClipboardList,t.orders],['sales',BarChart3,'Sales & reports'],['coupons',BarChart3,'Coupons'],['loyalty',BarChart3,'Rewards'],['inventory',PackagePlus,'Inventory'],['purchasing',Truck,'Purchasing'],['menu',MenuSquare,t.items],['settings',Settings,t.settings]] as const).map(([key,Icon,label])=><button className={`admin-nav ${tab===key?'admin-nav-active':''}`} key={key} onClick={()=>key==='orders'?openOrders():setTab(key)}><Icon size={19}/>{label}{key==='orders'&&(unread.length||pending)>0&&<span className="ml-auto bg-ember rounded-full text-xs min-w-6 h-6 px-1 grid place-items-center">{unread.length||pending}</span>}</button>)}</nav><Link to="/" className="text-[#d4ae92] text-sm flex items-center gap-2 mt-16">← Back to website</Link></aside>
    <section className="admin-content"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="section-kicker"><span/> {live?'LIVE CONTROL ROOM':'DEMO STAFF PANEL · LOCAL ONLY'}</div><h1 className="page-title mt-2">{tab==='overview'?'Overview':tab==='orders'?'Orders':tab==='sales'?'Sales & reports':tab==='coupons'?'Coupons':tab==='loyalty'?'Rewards':tab==='inventory'?'Inventory':tab==='purchasing'?'Purchasing':tab==='menu'?'Menu manager':'Store settings'}</h1><p className="text-[#928277] mt-2">Manage your restaurant operations from one place.</p></div><div className="flex flex-wrap gap-2 items-center"><button className="btn-secondary" type="button" onClick={()=>void toggleSound()} aria-pressed={soundEnabled} title="Browsers require a click to enable new-order sounds">{soundEnabled?<Bell size={16}/>:<BellOff size={16}/>} {soundEnabled?'Sound ON':'Enable sound'}</button><button className="btn-secondary" onClick={()=>{void load();void refreshOrders();}}><RefreshCw size={16}/>{t.refresh}</button></div></div>
    {!live&&<div className="notice my-7">Demo dashboard. Changes save to this browser only; they are never sent to a restaurant.</div>}{(error||orderError)&&<div role="alert" className="notice-error my-6">{error||orderError}</div>}
    <div className="flex flex-wrap items-center gap-2 mt-5 text-xs text-[#847669]" role="status">
      <span className={`w-2 h-2 rounded-full ${connection==='connected'?'bg-green-600':connection==='connecting'?'bg-amber-500':'bg-[#a78b72]'}`}/>
      {connection==='connected'?'Realtime channel connected · 20s polling backup':connection==='connecting'?'Connecting to Realtime · polling active':connection==='demo'?'Demo orders · browser local':'Polling every 20s · Realtime optional'}
    </div>
    {unread.length>0&&<section role="alert" aria-live="polite" className="panel mt-5 p-5 border-2 border-[#db782d] bg-[#fff3df]" data-testid="new-order-alert">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-extrabold text-lg text-[#884018]"><Bell className="inline-block mr-2" size={19}/>{unread.length} new {unread.length===1?'order':'orders'} received</p><p className="text-sm mt-1 text-[#8a6c55]">{unread.slice(0,3).map(o=>o.code).join(' · ')}{unread.length>3?' · …':''}</p></div><div className="flex flex-wrap gap-2"><button className="btn-primary" type="button" onClick={openOrders}>View orders</button><button className="btn-secondary" type="button" onClick={markRead}>Dismiss</button></div></div>
    </section>}
    <div className="lg:hidden flex flex-wrap gap-2 my-7">{(['overview','orders','sales','coupons','loyalty','inventory','purchasing','menu','settings'] as Tab[]).map(x=><button key={x} onClick={()=>x==='orders'?openOrders():setTab(x)} className={`category-pill ${tab===x?'selected':''}`}>{x}</button>)}</div>
    {tab==='overview'&&<><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mt-9">{[[ 'Orders today',orders.filter(o=>new Date(o.created_at).toDateString()===new Date().toDateString()).length,ClipboardList],['Awaiting approval',pending,Clock3],['Active orders',active,Utensils],['Menu dishes',dishes.length,MenuSquare]] .map(([label,value,Icon])=>{const I=Icon as typeof ClipboardList;return <div key={label as string} className="stat-card"><I size={25} className="text-ember"/><p className="text-[#8c7e71] text-sm mt-7">{label as string}</p><strong className="text-4xl font-extrabold mt-1 block">{value as number}</strong></div>;})}</div><div className="panel p-7 mt-7"><div className="flex justify-between gap-2"><h2 className="font-bold text-xl">Recent orders</h2><button className="text-ember font-bold text-sm" onClick={openOrders}>View all →</button></div>{orders.slice(0,5).length?orders.slice(0,5).map(o=><div key={o.id} className="py-4 border-b border-[#eee1d6] last:border-0 flex justify-between gap-4"><div><b>{o.code}</b><p className="text-sm text-[#94877d] mt-1">{o.customer_name} • {ORDER_STATUS_LABELS[o.status]}</p></div><b>{money(o.total)}</b></div>):<div className="text-[#8d8076] py-10 text-center">No orders yet.</div>}</div></>}
    {tab==='sales'&&<AdminSales live={live}/>}
    {tab==='coupons'&&<AdminCoupons live={live}/>}
    {tab==='loyalty'&&<AdminLoyalty live={live}/>}
    {tab==='inventory'&&<AdminInventory live={live} dishes={dishes}/>}
    {tab==='purchasing'&&<AdminPurchasing live={live}/>}
    {tab==='orders'&&<AdminOrders refreshSignal={orders.map(o=>`${o.id}:${o.status}:${o.updated_at??''}`).join('|')} busy={busy} onStatusChange={statusUpdate}/>}
    {tab==='menu'&&<div className="panel mt-9 overflow-hidden"><div className="p-6 flex flex-wrap justify-between gap-3 items-center"><h2 className="font-bold text-xl">All dishes <span className="text-sm text-[#988575]">({dishes.length})</span></h2><button className="btn-primary" onClick={()=>openEditor(blank())}><PackagePlus size={18}/> {t.create}</button></div><div className="overflow-x-auto"><table className="admin-table"><thead><tr><th>Item</th><th>Price / Offer</th><th>Category</th><th>Available</th><th></th></tr></thead><tbody>{dishes.map(d=><tr key={d.id}><td><div className="flex items-center gap-3 min-w-44"><div className="w-14 h-14 overflow-hidden rounded"><DishImage item={d} large/></div><div><strong>{d.name}</strong><small className="block text-[#a28a7c] mt-1">{d.active?'Visible':'Hidden'}</small></div></div></td><td className="font-bold"><div>{d.price===null?'Not set':money(discountedUnitPrice(d)!)}</div>{discountLabel(d)&&<div className="text-xs mt-1"><s className="text-[#947c6c] mr-2">{money(d.price!)}</s><span className="text-green-700 font-semibold">{discountLabel(d)}</span></div>}</td><td className="capitalize">{d.category}</td><td>{!d.available?'Disabled':d.in_stock===false?'Out of stock':'Yes'}</td><td><button className="btn-secondary !py-2" onClick={()=>openEditor(d)}>Edit</button></td></tr>)}</tbody></table></div></div>}
    {tab==='settings'&&settings&&<RestaurantSettingsForm settings={settings} onChange={editRestaurantSettings} onSave={e=>void saveSettings(e)} busy={busy}/>}
    <div className="flex items-center gap-2 text-xs text-[#938578] mt-9"><ShieldCheck size={16}/> Staff permissions are enforced by Supabase RLS, not by hiding buttons in React.</div>
    </section>
    {editor&&<div className="modal-backdrop" role="presentation" onClick={closeEditor}><div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Edit menu item" onClick={e=>e.stopPropagation()}><div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold">{editor.id?t.edit:t.create}</h2><button aria-label="Close" disabled={busy} onClick={closeEditor}><X size={23}/></button></div><form onSubmit={e=>void saveDish(e)} className="space-y-4"><div className="grid sm:grid-cols-2 gap-4"><label className="field">English name *<input required maxLength={120} value={editor.name} onChange={e=>updateEditor('name',e.target.value)}/></label><label className="field">Bangla name<input maxLength={120} value={editor.name_bn} onChange={e=>updateEditor('name_bn',e.target.value)}/></label></div><div className="grid sm:grid-cols-2 gap-4"><label className="field">Description<input maxLength={300} value={editor.description} onChange={e=>updateEditor('description',e.target.value)}/></label><label className="field">Bangla description<input maxLength={300} value={editor.description_bn} onChange={e=>updateEditor('description_bn',e.target.value)}/></label></div><div className="grid sm:grid-cols-2 gap-4"><label className="field">Price (BDT, blank = unpriced)<input type="number" min={1} max={999999} step="1" value={editor.price??''} onChange={e=>updateEditor('price',e.target.value===''?null:Number(e.target.value))}/></label><label className="field">Category<select value={editor.category} onChange={e=>updateEditor('category',e.target.value as Category)}>{MENU_CATEGORIES.map(c=><option key={c} value={c}>{t[c]}</option>)}</select></label></div><div className="rounded-xl border border-[#ead5c3] p-4 bg-[#fff8f0] space-y-3"><div><h3 className="text-base font-bold">Item discount</h3><p className="text-xs text-[#806c5e] mt-1">Set a different offer for each dish. Discount is applied at checkout by Supabase.</p></div><div className="grid sm:grid-cols-2 gap-4"><label className="field">Discount type<select value={editor.discount_type??'none'} onChange={e=>setEditor(prev=>prev?{...prev,discount_type:e.target.value as MenuItem['discount_type'],discount_value:0}:null)}><option value="none">No discount</option><option value="percent">Percentage (%)</option><option value="fixed">Fixed amount (৳)</option></select></label><label className="field">Discount {editor.discount_type==='percent'?'(%)':'(৳)'}<input type="number" min="1" max={editor.discount_type==='percent'?99:Math.max(1,(editor.price??1)-1)} step="1" disabled={!editor.discount_type||editor.discount_type==='none'} value={editor.discount_type&&editor.discount_type!=='none'?(editor.discount_value||''):''} onChange={e=>updateEditor('discount_value',e.target.value===''?0:Number(e.target.value))} placeholder="Enter discount"/></label></div>{discountLabel(editor)&&<div className="flex flex-wrap items-center gap-3 text-sm"><span className="font-semibold text-green-800">Preview: {discountLabel(editor)}</span><s className="text-[#917a6f]">{money(editor.price!)}</s><strong className="text-ember text-lg">{money(discountedUnitPrice(editor)!)}</strong></div>}{validateDiscount(editor)&&<div className="text-sm text-red-700" role="alert">{validateDiscount(editor)}</div>}</div><MenuImageUpload item={editor} pendingFile={pendingImage} onFileChange={setPendingImage} onUrlChange={url=>updateEditor('image_url',url)} live={live} disabled={busy}/><div className="grid sm:grid-cols-2 gap-4"><label className="field">Badge<input maxLength={40} value={editor.badge} onChange={e=>updateEditor('badge',e.target.value)}/></label><label className="field">Sort order<input type="number" min="0" value={editor.sort_order} onChange={e=>updateEditor('sort_order',Number(e.target.value))}/></label></div><div className="flex gap-6 flex-wrap"><label className="inline-flex gap-2 items-center"><input type="checkbox" checked={editor.active} onChange={e=>updateEditor('active',e.target.checked)}/>Visible</label><label className="inline-flex gap-2 items-center"><input type="checkbox" checked={editor.available} onChange={e=>updateEditor('available',e.target.checked)}/>Available</label></div><div className="flex gap-3 pt-3"><button className="btn-primary flex-1 justify-center" disabled={busy}><Check size={17}/>Save dish</button><button type="button" disabled={busy} onClick={closeEditor} className="btn-secondary">{t.cancel}</button></div></form><p className="text-xs text-[#987f70] mt-5">Hide dishes instead of deleting them; historical order lines must remain intact.</p></div></div>}
  </div>;
}
