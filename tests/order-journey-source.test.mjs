import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
test('checkout preserves secure order RPC and moves to a dedicated receipt page',()=>{
 const checkout=read('../src/pages/Checkout.tsx');const api=read('../src/data/api.ts');
 assert.match(checkout,/saveReceipt\(order,info\.type/);
 assert.match(checkout,/navigate\('\/order-confirmation'/);
 assert.match(api,/place_order_v2/);
 assert.doesNotMatch(checkout,/localStorage/);
});
test('receipt uses tab-scoped data without persisting customer PII',()=>{
 const source=read('../src/lib/orderReceipt.ts');
 assert.match(source,/sessionStorage\.setItem/);
 assert.doesNotMatch(source,/localStorage\.setItem/);
 assert.match(source,/RECEIPT_TTL_MS=24\*60\*60\*1000/);
 assert.doesNotMatch(source,/phone:|address:|email:/);
});
test('tracking uses status-specific steps and foreground-only interval',()=>{
 const track=read('../src/pages/Track.tsx');
 assert.match(track,/journeySteps\(result\.status,result\.fulfillment_type,locale\)/);
 assert.match(track,/document\.visibilityState==='visible'/);
 assert.match(track,/30000/);
 assert.match(track,/shouldPollOrder/);
});
test('private pages are noindex and browser does not send referrer headers',()=>{
 const seo=read('../src/lib/seo.ts');const html=read('../index.html');
 assert.match(seo,/order-confirmation/);
 assert.match(html,/name="referrer" content="no-referrer"/);
 const vercel=JSON.parse(read('../vercel.json'));
 assert.ok(vercel.headers.some(h=>h.source==='/order-confirmation'));
});
