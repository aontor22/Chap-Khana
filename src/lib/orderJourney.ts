import type { Fulfillment, OrderStatus } from '../types';

export type JourneyStep = {status:OrderStatus; label:string; reached:boolean; current:boolean};
const pickup:OrderStatus[]=['pending','confirmed','preparing','ready','completed'];
const delivery:OrderStatus[]=['pending','confirmed','preparing','ready','out_for_delivery','completed'];
const labels:Record<OrderStatus,{en:string;bn:string}>={
  pending:{en:'Awaiting confirmation',bn:'নিশ্চিত হওয়ার অপেক্ষায়'},
  confirmed:{en:'Order confirmed',bn:'অর্ডার নিশ্চিত হয়েছে'},
  preparing:{en:'Preparing your food',bn:'খাবার তৈরি হচ্ছে'},
  ready:{en:'Food is ready',bn:'খাবার প্রস্তুত'},
  out_for_delivery:{en:'Out for delivery',bn:'ডেলিভারির পথে'},
  completed:{en:'Order completed',bn:'অর্ডার সম্পন্ন'},
  cancelled:{en:'Order cancelled',bn:'অর্ডার বাতিল হয়েছে'},
};
export const orderStatusLabel=(status:OrderStatus,lang:'en'|'bn')=>labels[status][lang];
export function journeySteps(status:OrderStatus, type:Fulfillment, lang:'en'|'bn'):JourneyStep[]{
  if(status==='cancelled')return [];
  const flow=type==='delivery'?delivery:pickup;
  const current=flow.indexOf(status);
  return flow.map((step,index)=>({status:step,label:labels[step][lang],reached:current>=0&&index<=current,current:step===status}));
}
export function orderHelp(status:OrderStatus,type:Fulfillment,lang:'en'|'bn'){
  const en:Record<OrderStatus,string>={
    pending:'The restaurant has received your request and will confirm it.',
    confirmed:'The restaurant has accepted your order.',
    preparing:'Your meal is being prepared.',
    ready:type==='pickup'?'Your food is ready. Contact the restaurant before collecting.':'Your food is ready for dispatch.',
    out_for_delivery:'Your order has left for delivery. Arrival time is not guaranteed.',
    completed:'Your order has been completed. Thank you!',
    cancelled:'This order was cancelled. Contact the restaurant if you need assistance.',
  };
  const bn:Record<OrderStatus,string>={
    pending:'রেস্টুরেন্ট অর্ডার পেয়েছে, নিশ্চিত করার অপেক্ষায় আছে।',
    confirmed:'রেস্টুরেন্ট অর্ডার গ্রহণ করেছে।',
    preparing:'আপনার খাবার তৈরি হচ্ছে।',
    ready:type==='pickup'?'খাবার প্রস্তুত। সংগ্রহের আগে রেস্টুরেন্টে যোগাযোগ করুন।':'খাবার পাঠানোর জন্য প্রস্তুত।',
    out_for_delivery:'আপনার খাবার ডেলিভারির পথে। পৌঁছানোর সময় নিশ্চিত নয়।',
    completed:'অর্ডার সম্পন্ন হয়েছে। ধন্যবাদ!',
    cancelled:'অর্ডারটি বাতিল হয়েছে। প্রয়োজনে রেস্টুরেন্টে যোগাযোগ করুন।',
  };
  return (lang==='bn'?bn:en)[status];
}
export const shouldPollOrder=(status:OrderStatus|null)=>status!==null&&!['completed','cancelled'].includes(status);
