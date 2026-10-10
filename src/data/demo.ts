import catalog from './menu-catalog.json';
import { normalizeStoreSettings } from '../lib/storeProfile';
import type { Category, MenuItem, StoreSettings } from '../types';

// Photographed menus supplied for the Khilkhet restaurant. These prices are transcribed
// for review; never activate real orders until the restaurant confirms the final catalog.
export const demoMenu: MenuItem[] = catalog.map(item => ({...item,discount_type:'none' as const,discount_value:0,category:item.category as Category}));
export const demoSettings: StoreSettings = normalizeStoreSettings({id:1,accepting_orders:true,pickup_enabled:true,delivery_enabled:true,delivery_fee:60});
