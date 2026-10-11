import { describe, expect, it } from 'vitest';
import { emptyOrderCursor, reconcileOrderSnapshot } from '../src/lib/orderNotifications';
import type { Order } from '../src/types';

const order = (id:string, created_at:string, status:Order['status']='pending'):Order => ({
  id, code:`CK-${id}`, tracking_token:id, customer_name:'Sample', customer_phone:'01700000000',
  fulfillment_type:'pickup', delivery_address:'', notes:'', status,
  subtotal:100, delivery_fee:0, total:100, created_at
});
const earlier='2026-10-10T10:00:00.000Z';
const later='2026-10-10T10:00:02.000Z';

describe('new order notifications', () => {
  it('does not notify existing orders on initial dashboard load', () => {
    expect(reconcileOrderSnapshot(emptyOrderCursor(), [order('a',earlier)]).newOrders).toEqual([]);
  });
  it('alerts once for a new order received through refresh', () => {
    const baseline=reconcileOrderSnapshot(emptyOrderCursor(),[order('a',earlier)]);
    const added=reconcileOrderSnapshot(baseline.cursor,[order('b',later),order('a',earlier)]);
    expect(added.newOrders.map(o=>o.id)).toEqual(['b']);
    expect(reconcileOrderSnapshot(added.cursor,[order('b',later),order('a',earlier)]).newOrders).toEqual([]);
  });
  it('does not alert an older historical order arriving in a later page snapshot', () => {
    const baseline=reconcileOrderSnapshot(emptyOrderCursor(),[order('a',later)]);
    const result=reconcileOrderSnapshot(baseline.cursor,[order('a',later),order('old',earlier)]);
    expect(result.newOrders).toEqual([]);
  });
  it('alerts for multiple new orders in chronological order',()=>{
    const baseline=reconcileOrderSnapshot(emptyOrderCursor(),[order('a',earlier)]);
    const result=reconcileOrderSnapshot(baseline.cursor,[order('c','2026-10-10T10:00:05.000Z'),order('b',later)]);
    expect(result.newOrders.map(o=>o.id)).toEqual(['b','c']);
  });
  it('allows new orders after the initial empty snapshot',()=>{
    const baseline=reconcileOrderSnapshot(emptyOrderCursor(),[]);
    expect(reconcileOrderSnapshot(baseline.cursor,[order('a',later)]).newOrders.map(o=>o.id)).toEqual(['a']);
  });
  it('retains the newest timestamp even if next snapshot is older',()=>{
    const baseline=reconcileOrderSnapshot(emptyOrderCursor(),[order('a',later)]);
    const result=reconcileOrderSnapshot(baseline.cursor,[order('old',earlier)]);
    expect(result.cursor.latestCreatedAt).toBe(Date.parse(later));
  });
});
