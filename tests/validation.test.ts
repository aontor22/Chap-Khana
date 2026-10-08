import { describe, expect, it } from 'vitest';
import { validateCheckout } from '../src/lib/utils';
import { demoMenu, demoSettings } from '../src/data/demo';
import type { CheckoutInfo } from '../src/types';
const valid:CheckoutInfo={name:'Demo Customer',phone:'01712345678',type:'pickup',address:'',notes:''};
const cart={'chicken-chap':2};
describe('checkout safety validation',()=>{
  it('accepts valid pickup order',()=>expect(validateCheckout(valid,cart,demoMenu,demoSettings)).toBeNull());
  it('blocks invalid phone',()=>expect(validateCheckout({...valid,phone:'1234'},cart,demoMenu,demoSettings)).toMatch(/mobile/));
  it('blocks missing delivery address',()=>expect(validateCheckout({...valid,type:'delivery'},cart,demoMenu,demoSettings)).toMatch(/address/));
  it('blocks orders when closed',()=>expect(validateCheckout(valid,cart,demoMenu,{...demoSettings,accepting_orders:false})).toMatch(/closed/));
  it('blocks unpriced dishes',()=>expect(validateCheckout(valid,cart,demoMenu.map(x=>({...x,price:null})),demoSettings)).toMatch(/unavailable/));
  it('blocks invalid quantities',()=>expect(validateCheckout(valid,{'chicken-chap':21},demoMenu,demoSettings)).toMatch(/portion/));
  it('blocks duplicate client price manipulation by requiring menu items',()=>expect(validateCheckout(valid,{'fake-id':1},demoMenu,demoSettings)).toMatch(/unavailable/));
});
