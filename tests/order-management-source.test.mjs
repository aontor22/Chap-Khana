import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(file)=>readFileSync(new URL(file,import.meta.url),'utf8');
const api=source('../src/data/api.ts');
const component=source('../src/components/AdminOrders.tsx');
const admin=source('../src/pages/Admin.tsx');
const styles=source('../src/styles/index.css');
test('order listing uses server-side range with exact count, status, search field, and date boundaries',()=>{
 assert.match(api,/\.range\(\(safePage-1\)\*ADMIN_ORDER_PAGE_SIZE/);
 assert.match(api,/count:'exact'/);
 assert.match(api,/\.ilike\(filter\.searchField/);
 assert.match(api,/\.lt\('created_at'/);
 assert.match(api,/\.gte\('created_at'/);
});
test('details query is isolated to approved staff RLS and fetches original line snapshots',()=>{
 assert.match(api,/getAdminOrderDetail/);
 assert.match(api,/\.from\('orders'\)\.select\('\*,order_items\(\*\)'\)/);
 assert.doesNotMatch(api,/\.from\('orders'\)\.delete/);
});
test('admin orders have search, date, status, pagination, details and a print-only ticket',()=>{
 for(const feature of ['Search orders','From date','To date','All statuses','Previous','Next','Print kitchen ticket','Kitchen Order Ticket'])assert.ok(component.includes(feature),feature);
 assert.ok(styles.includes('@media print'));
 assert.ok(styles.includes('.print-kitchen'));
 assert.ok(admin.includes('<AdminOrders'));
});
test('notifications and admin role guard stay wired in parent dashboard',()=>{
 assert.match(admin,/useAdminOrderAlerts/);
 assert.match(admin,/adminStatus==='allowed'/);
 assert.match(admin,/statusUpdate/);
});
