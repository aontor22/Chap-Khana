import { describe, expect, it } from 'vitest';
import { csvCell, demoSalesReport, dhakaDate, isISODate, monthRollup, parseSalesReport, salesCSV, shiftISODate, validateReportRange } from '../src/lib/salesAnalytics';
import type { Order } from '../src/types';

const fixture=(status:Order['status'],id:string,total:number, day='2026-10-10T20:30:00Z'):Order=>({
 id,code:'CK-'+id,tracking_token:'test',customer_name:'Customer',customer_phone:'01700000000',fulfillment_type:'pickup',delivery_address:'',notes:'',status,
 subtotal:total-20,delivery_fee:20,total,created_at:day,
 order_items:[{item_name:'Chicken Chap',unit_price:80,original_unit_price:100,discount_unit_amount:20,qty:2,line_total:160}]
});

describe('staff analytics calculations and report boundaries',()=>{
 it('rejects invalid calendar dates and reversed dates',()=>{
  expect(isISODate('2026-02-30')).toBe(false);
  expect(validateReportRange('2026-10-12','2026-10-10')).toBeTruthy();
  expect(validateReportRange('2025-01-01','2026-10-10')).toBeTruthy();
  expect(validateReportRange('2026-01-01','2026-12-31')).toBe(null);
 });
 it('uses Dhaka calendar day including midnight crossover',()=>{
  expect(dhakaDate('2026-10-10T20:30:00Z')).toBe('2026-10-11');
  expect(shiftISODate('2026-03-01',-1)).toBe('2026-02-28');
 });
 it('excludes pending and cancelled value but counts order volumes',()=>{
  const report=demoSalesReport([fixture('completed','one',200),fixture('cancelled','two',200),fixture('pending','three',200)],'2026-10-11','2026-10-11');
  expect(report.totals.orders).toBe(3);expect(report.totals.completed).toBe(1);expect(report.totals.cancelled).toBe(1);
  expect(report.totals.active).toBe(1);expect(report.totals.order_value).toBe(200);
  expect(report.totals.savings).toBe(40);expect(report.dishes[0].quantity).toBe(2);
 });
 it('does not count orders outside selected date range',()=>{
  const report=demoSalesReport([fixture('completed','one',200)],'2026-10-09','2026-10-10');
  expect(report.totals.orders).toBe(0);
 });
 it('groups daily values by month',()=>{
  expect(monthRollup([{day:'2026-09-30',orders:1,completed:1,cancelled:0,order_value:100,savings:5},{day:'2026-10-01',orders:2,completed:1,cancelled:1,order_value:80,savings:1}])).toHaveLength(2);
 });
 it('escapes malicious spreadsheet cells and omits customer PII',()=>{
  expect(csvCell('=IMPORTXML("https://bad.example")')).toContain("'=IMPORTXML");
  const report=demoSalesReport([fixture('completed','one',200)],'2026-10-11','2026-10-11');
  expect(salesCSV(report,'dishes')).not.toContain('01700000000');
  expect(salesCSV(report,'daily')).toContain('Completed order value');
 });
 it('validates RPC report shapes',()=>{
  expect(()=>parseSalesReport({from:'2026-10-11',to:'2026-10-11',timezone:'Asia/Dhaka',totals:{orders:1},daily:[],dishes:[]},'2026-10-11','2026-10-11')).not.toThrow();
  expect(()=>parseSalesReport({from:'2026-10-10',to:'2026-10-11',timezone:'Asia/Dhaka',totals:{},daily:[],dishes:[]},'2026-10-11','2026-10-11')).toThrow();
 });
});
