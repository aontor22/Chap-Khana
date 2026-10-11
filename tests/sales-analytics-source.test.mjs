import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(name)=>readFileSync(new URL(name,import.meta.url),'utf8');
const sql=read('../supabase/migrations/11_staff_sales_analytics.sql');
const ui=read('../src/components/AdminSales.tsx');
const api=read('../src/data/api.ts');
const admin=read('../src/pages/Admin.tsx');
const logic=read('../src/lib/salesAnalytics.ts');
test('staff sales report is protected by database-side allowlist and restrictive RPC grants',()=>{
 assert.match(sql,/SECURITY DEFINER SET search_path = ''/);
 assert.match(sql,/auth\.uid\(\) IS NULL OR NOT EXISTS/);
 assert.match(sql,/public\.admin_users/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.staff_sales_report\(date,date\) FROM PUBLIC, anon, authenticated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.staff_sales_report\(date,date\) TO authenticated/);
});
test('analytics reports avoid sensitive customer fields and exclude uncompleted totals',()=>{
 assert.match(sql,/WHERE status = 'completed'/);
 assert.match(sql,/FILTER \(WHERE status='completed'\)/);
 assert.match(sql,/discount_unit_amount/);
 assert.doesNotMatch(sql,/customer_phone|customer_name|tracking_token|delivery_address/i);
});
test('all dates use Asia/Dhaka with a bounded report window',()=>{
 assert.match(sql,/p_to - p_from > 365/);
 assert.match(sql,/Asia\/Dhaka/);
 assert.match(logic,/validateReportRange/);
 assert.match(logic,/monthRollup/);
});
test('staff dashboard includes sales page, filters and privacy-safe CSV download',()=>{
 assert.match(admin,/type Tab='overview'\|'orders'\|'menu'\|'settings'\|'sales'/);
 assert.match(admin,/<AdminSales live=\{live\}/);
 assert.match(ui,/Sales & Reports/);
 assert.match(ui,/salesCSV\(report/);
 assert.match(api,/\.rpc\('staff_sales_report'/);
 assert.doesNotMatch(ui,/customer_phone|delivery_address|tracking_token/);
});
