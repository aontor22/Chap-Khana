import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useShop } from './context/ShopContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import CartPage from './pages/Cart';
import Checkout from './pages/Checkout';
import Track from './pages/Track';
import Account from './pages/Account';
import Admin from './pages/Admin';

function AuthCallback(){
  const navigate=useNavigate();const {user,authLoading}=useShop();
  useEffect(()=>{if(!authLoading){const next=sessionStorage.getItem('ckr_auth_destination')||'/account';sessionStorage.removeItem('ckr_auth_destination');navigate(user&&next.startsWith('/')&&!next.startsWith('//')?next:'/account',{replace:true});}},[authLoading,user,navigate]);
  return <div className="min-h-[50vh] grid place-items-center"><div className="panel p-10">Completing secure sign-in…</div></div>;
}
export default function App(){
  return <Layout><Routes>
    <Route path="/" element={<Home/>}/><Route path="/menu" element={<Home/>}/>
    <Route path="/cart" element={<CartPage/>}/><Route path="/checkout" element={<Checkout/>}/>
    <Route path="/track" element={<Track/>}/><Route path="/account" element={<Account/>}/>
    <Route path="/admin" element={<Admin/>}/><Route path="/auth/callback" element={<AuthCallback/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Layout>;
}
