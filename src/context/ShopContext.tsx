import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isConfigured } from '../lib/config';
import { fromStorage, saveStorage } from '../lib/utils';
import { discountedUnitPrice } from '../lib/discount';
import { getMenu, getSettings, isStaff } from '../data/api';
import type { Cart, Locale, MenuItem, StoreSettings } from '../types';
import { demoSettings } from '../data/demo';
import { getText } from '../data/i18n';

type TextType = ReturnType<typeof getText>;
export type AdminAccessStatus = 'checking' | 'allowed' | 'denied' | 'error';
type RoleLookup = { userId:string; status:AdminAccessStatus; error:string|null };
interface ShopState {
  live:boolean; locale:Locale; setLocale:(lang:Locale)=>void; t:TextType;
  user:User|null; authLoading:boolean; adminStatus:AdminAccessStatus; adminError:string|null; refreshAdminAccess:()=>Promise<void>; signInGoogle:(returnTo?:string)=>Promise<void>; signInPassword:(email:string,password:string)=>Promise<void>; signOut:()=>Promise<void>;
  menu:MenuItem[]; settings:StoreSettings; loading:boolean; error:string|null; refresh:()=>Promise<void>;
  cart:Cart; count:number; subtotal:number; add:(id:string)=>void; decrease:(id:string)=>void; remove:(id:string)=>void; clearCart:()=>void;
  alert:string; notify:(message:string)=>void;
}
const ShopContext=createContext<ShopState|null>(null);
export function ShopProvider({children}:{children:ReactNode}) {
  const [locale,setLocaleInner]=useState<Locale>(()=>fromStorage<Locale>('ckr_lang','en'));
  const [cart,setCart]=useState<Cart>(()=>fromStorage<Cart>('ckr_cart',{}));
  const [menu,setMenu]=useState<MenuItem[]>([]);
  const [settings,setSettings]=useState<StoreSettings>(isConfigured ? {...demoSettings,accepting_orders:false,delivery_enabled:false,delivery_fee:0} : demoSettings);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [user,setUser]=useState<User|null>(null);
  const [authLoading,setAuthLoading]=useState(Boolean(supabase));
  const [roleLookup,setRoleLookup]=useState<RoleLookup|null>(null);
  const [alert,setAlert]=useState('');
  const notify=useCallback((s:string)=>setAlert(s),[]);
  const setLocale=(lang:Locale)=>{setLocaleInner(lang);saveStorage('ckr_lang',lang);document.documentElement.lang=lang;};
  useEffect(()=>{document.documentElement.lang=locale;},[locale]);
  useEffect(()=>{saveStorage('ckr_cart',cart);},[cart]);
  useEffect(()=>{if (!alert) return;const timeout=setTimeout(()=>setAlert(''),4600);return ()=>clearTimeout(timeout);},[alert]);
  const refresh=useCallback(async()=>{
    try {const [items,cfg]=await Promise.all([getMenu(),getSettings()]);setMenu(items);setSettings(cfg);setCart(prev=>Object.fromEntries(Object.entries(prev).filter(([id,qty])=>qty>0&&items.some(m=>m.id===id&&m.active&&m.available&&Boolean(m.price)))));setError(null);}
    catch(e){setError(e instanceof Error?e.message:'Could not load menu.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>{void refresh();},60000);return ()=>clearInterval(timer);},[refresh]);
  useEffect(()=>{
    if(!supabase){setAuthLoading(false);return;}
    const client=supabase;
    let active=true;
    void client.auth.getSession().then(({data,error})=>{
      if(active){setUser(data.session?.user||null);setAuthLoading(false);if(error)setError(error.message);}
    });
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{setUser(session?.user||null);setAuthLoading(false);});
    return ()=>{active=false;subscription.unsubscribe();};
  },[]);
  // Resolve staff membership from the server-side allowlist, never from a Google
  // email, user_metadata, or a flag in localStorage. A role is bound to its user ID.
  useEffect(()=>{
    if (!isConfigured || authLoading || !user) {setRoleLookup(null);return;}
    let current=true;
    setRoleLookup({userId:user.id,status:'checking',error:null});
    void isStaff(user.id).then(allowed=>{
      if(current)setRoleLookup({userId:user.id,status:allowed?'allowed':'denied',error:null});
    }).catch(error=>{
      if(current)setRoleLookup({userId:user.id,status:'error',error:error instanceof Error?error.message:'Could not verify staff access.'});
    });
    return ()=>{current=false;};
  },[user?.id,authLoading]);
  const refreshAdminAccess=useCallback(async()=>{
    if(!isConfigured || !user || authLoading)return;
    const uid=user.id;
    setRoleLookup({userId:uid,status:'checking',error:null});
    try{
      const allowed=await isStaff(uid);
      setRoleLookup(prev=>prev?.userId===uid?{userId:uid,status:allowed?'allowed':'denied',error:null}:prev);
    }catch(error){
      setRoleLookup(prev=>prev?.userId===uid?{userId:uid,status:'error',error:error instanceof Error?error.message:'Could not verify staff access.'}:prev);
    }
  },[user?.id,authLoading]);
  const adminStatus:AdminAccessStatus=!isConfigured?'allowed':authLoading?'checking':!user?'denied':roleLookup?.userId!==user.id?'checking':roleLookup.status;
  const adminError=adminStatus==='error'?roleLookup?.error||'Staff verification failed.':null;
  const signInGoogle=async(returnTo='/account')=>{
    if(!supabase){notify('Google sign-in is available after Supabase configuration.');return;}
    sessionStorage.setItem('ckr_auth_destination',returnTo);
    const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}/auth/callback`,queryParams:{prompt:'select_account'}}});
    if(error) {sessionStorage.removeItem('ckr_auth_destination');throw error;}
  };
  const signInPassword=async(email:string,password:string)=>{
    if(!supabase) throw new Error('Configure Supabase first.');
    const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
  };
  const signOut=async()=>{if(!supabase)return;const {error}=await supabase.auth.signOut();if(error)throw error;};
  const add=(id:string)=>{
    const item=menu.find(m=>m.id===id);
    if (!settings.accepting_orders || !item?.active || !item.available || !item.price){notify('This item cannot be ordered right now.');return;}
    setCart(prev=>({...prev,[id]:Math.min(20,(prev[id]||0)+1)}));notify(`${locale==='bn'?item.name_bn:item.name} added to cart`);
  };
  const decrease=(id:string)=>setCart(prev=>{const next={...prev};next[id]=(next[id]||0)-1;if(next[id]<=0)delete next[id];return next;});
  const remove=(id:string)=>setCart(prev=>{const next={...prev};delete next[id];return next;});
  const clearCart=()=>setCart({});
  const count=Object.values(cart).reduce((s,n)=>s+(Number.isInteger(n)&&n>0?n:0),0);
  const subtotal=menu.reduce((s,m)=>s+(discountedUnitPrice(m)||0)*(cart[m.id]||0),0);
  const value=useMemo<ShopState>(()=>({live:isConfigured,locale,setLocale,t:getText(locale),user,authLoading,adminStatus,adminError,refreshAdminAccess,signInGoogle,signInPassword,signOut,menu,settings,loading,error,refresh,cart,count,subtotal,add,decrease,remove,clearCart,alert,notify}),
    // These handlers depend on current cart/menu/auth; memoization is for one consistent context snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale,user,authLoading,adminStatus,adminError,refreshAdminAccess,menu,settings,loading,error,refresh,cart,count,subtotal,alert]);
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}
export function useShop(){const context=useContext(ShopContext);if(!context)throw new Error('useShop must be inside ShopProvider');return context;}
