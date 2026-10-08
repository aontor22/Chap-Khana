import type { MenuItem, StoreSettings } from '../types';
const pic=(s: string)=>`https://images.unsplash.com/${s}?auto=format&fit=crop&w=1000&q=78`;
export const demoMenu: MenuItem[] = [
  {id:'chicken-chap',category:'chap',name:'Chicken Chap',name_bn:'চিকেন চাপ',description:'Smoky, tender and boldly spiced.',description_bn:'ধোঁয়া ওঠা মশলাদার স্বাদ।',price:220,image_url:pic('photo-1555939594-58d7cb561ad1'),badge:'Signature',sort_order:1,active:true,available:true},
  {id:'beef-kala-bhuna',category:'special',name:'Beef Kala Bhuna',name_bn:'বিফ কালা ভুনা',description:'Slow cooked. Full of warmth.',description_bn:'ধীরে রান্না করা গাঢ় স্বাদ।',price:290,image_url:pic('photo-1603894584373-5ac82b2ae398'),badge:'Fan favourite',sort_order:2,active:true,available:true},
  {id:'beef-nehari',category:'special',name:'Beef Nehari',name_bn:'বিফ নেহারি',description:'Comfort food worth gathering for.',description_bn:'সবার সঙ্গে ভাগ করে খাওয়ার মতো।',price:260,image_url:pic('photo-1546833999-b9f581a1996d'),badge:'Popular',sort_order:3,active:true,available:true},
  {id:'tandoori-chicken',category:'grill',name:'Tandoori Chicken',name_bn:'তন্দুরি চিকেন',description:'A little char. A lot of flavour.',description_bn:'হালকা পোড়া, মজাদার স্বাদ।',price:280,image_url:pic('photo-1562967914-608f82629710'),badge:'',sort_order:4,active:true,available:true},
  {id:'grilled-chicken',category:'grill',name:'Grilled Chicken',name_bn:'গ্রিলড চিকেন',description:'Straight from the flame.',description_bn:'আগুনে গ্রিল করা স্বাদ।',price:320,image_url:pic('photo-1555939594-58d7cb561ad1'),badge:'',sort_order:5,active:true,available:true},
  {id:'naan',category:'sides',name:'Naan Bread',name_bn:'নান রুটি',description:'A perfect pairing for your meal.',description_bn:'পছন্দের খাবারের সঙ্গে মানানসই।',price:55,image_url:pic('photo-1606491956689-2ea866880c84'),badge:'',sort_order:6,active:true,available:true},
];
export const demoSettings: StoreSettings = { id:1,accepting_orders:true,pickup_enabled:true,delivery_enabled:true,delivery_fee:60 };
