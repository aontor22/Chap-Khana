import {describe,expect,it} from 'vitest';
import {groupKitchenOrders,kitchenColumn,kitchenNext,kitchenUrgency,queueMinutes} from '../src/lib/kitchen';
import type {KitchenOrder} from '../src/lib/kitchen';
const mk=(code:string,status:KitchenOrder['status'],created_at:string):KitchenOrder=>({id:code,code,status,created_at,fulfillment_type:'pickup',notes:'',order_items:[]});
describe('Kitchen display board',()=>{
  it('moves pickup orders from ready directly to completed',()=>{
    expect(kitchenNext('pending','pickup')).toBe('confirmed');
    expect(kitchenNext('ready','pickup')).toBe('completed');
  });
  it('requires a delivery handoff before completing delivery orders',()=>{
    expect(kitchenNext('ready','delivery')).toBe('out_for_delivery');
    expect(kitchenNext('out_for_delivery','delivery')).toBe('completed');
  });
  it('rejects terminal orders',()=>{
    expect(kitchenNext('completed','pickup')).toBe(null);
    expect(kitchenNext('cancelled','delivery')).toBe(null);
  });
  it('groups handoff and sorts oldest orders first',()=>{
    const q=groupKitchenOrders([mk('b','ready','2026-10-14T09:15:00Z'),mk('a','out_for_delivery','2026-10-14T09:00:00Z'),mk('c','pending','2026-10-14T09:10:00Z')]);
    expect(q.handoff.map(o=>o.code)).toEqual(['a','b']);
    expect(q.pending.map(o=>o.code)).toEqual(['c']);
  });
  it('ignores completed and cancelled cards',()=>{
    expect(kitchenColumn('completed')).toBe(null);
    expect(kitchenColumn('cancelled')).toBe(null);
  });
  it('shows accurate elapsed minutes without negative values',()=>{
    expect(queueMinutes('2026-10-14T09:00:00Z',Date.parse('2026-10-14T09:16:00Z'))).toBe(16);
    expect(queueMinutes('2026-10-14T09:30:00Z',Date.parse('2026-10-14T09:16:00Z'))).toBe(0);
  });
  it('distinguishes caution and late threshold',()=>{
    expect(kitchenUrgency(14)).toBe('normal');
    expect(kitchenUrgency(15)).toBe('watch');
    expect(kitchenUrgency(30)).toBe('late');
  });
});
