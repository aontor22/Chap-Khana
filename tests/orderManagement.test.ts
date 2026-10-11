import { describe,expect,it } from 'vitest';
import { ADMIN_ORDER_PAGE_SIZE, defaultOrderFilter, dhakaDayBounds, filterDemoOrders, normalizeOrderSearch, orderDateTime, paginateOrders, validateOrderFilters } from '../src/lib/orderManagement';
import type { Order } from '../src/types';
const demo=(n:number,date='2026-10-11T10:00:00Z'):Order=>({
  id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,code:`CK-${n}`,
  tracking_token:'',customer_name:`Customer ${n}`,customer_phone:`017000000${String(n).padStart(2,'0')}`,
  fulfillment_type:'pickup',delivery_address:'',notes:'',status:n%2?'pending':'completed',subtotal:100,delivery_fee:0,total:100,created_at:date
});
describe('advanced admin order filters',()=>{
  it('uses Dhaka calendar start and exclusive next day UTC boundary',()=>{
    expect(dhakaDayBounds('2026-10-11')).toEqual({start:'2026-10-10T18:00:00.000Z',end:'2026-10-11T18:00:00.000Z'});
    expect(dhakaDayBounds('2026-02-30')).toBeNull();
    expect(orderDateTime('2026-10-10T18:05:00Z')).toMatch(/11 Oct 2026/);
  });
  it('does not accept reversed dates or an invalid calendar date',()=>{
    expect(validateOrderFilters({...defaultOrderFilter(),fromDate:'2026-10-12',toDate:'2026-10-11'})).toContain('From');
    expect(validateOrderFilters({...defaultOrderFilter(),fromDate:'2026-02-30'})).toContain('valid');
  });
  it('drops wildcard characters from customer search to avoid accidental broad matches',()=>{
    expect(normalizeOrderSearch('  A%_\\B  ')).toBe('AB');
  });
  it('paginates after filtering and orders newest first',()=>{
    const all=Array.from({length:33},(_,i)=>demo(i+1,new Date(Date.parse('2026-10-11T00:00:00Z')+i*60000).toISOString()));
    const filtered=filterDemoOrders(all,{...defaultOrderFilter(),status:'pending'});
    const page=paginateOrders(filtered,2);
    expect(page.total).toBe(17);
    expect(page.rows.length).toBe(2);
    expect(ADMIN_ORDER_PAGE_SIZE).toBe(15);
    expect(filtered[0].code).toBe('CK-33');
  });
  it('supports search by name, phone, or order code without combining fields',()=>{
    const items=[demo(1),demo(2)];
    expect(filterDemoOrders(items,{...defaultOrderFilter(),search:'Customer 2',searchField:'customer_name'}).map(o=>o.code)).toEqual(['CK-2']);
    expect(filterDemoOrders(items,{...defaultOrderFilter(),search:'CK-1'}).map(o=>o.code)).toEqual(['CK-1']);
  });
  it('treats selected end date as inclusive for the local day, exclusive of the next',()=>{
    const items=[demo(1,'2026-10-10T17:59:59Z'),demo(2,'2026-10-10T18:00:00Z'),demo(3,'2026-10-11T17:59:59Z'),demo(4,'2026-10-11T18:00:00Z')];
    const filtered=filterDemoOrders(items,{...defaultOrderFilter(),fromDate:'2026-10-11',toDate:'2026-10-11'});
    expect(filtered.map(o=>o.code)).toEqual(['CK-3','CK-2']);
  });
});
