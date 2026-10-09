import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../src/data/menu-catalog.json',import.meta.url),'utf8'));
const sql = readFileSync(new URL('../supabase/migrations/04_brand_menu_catalog.sql',import.meta.url),'utf8');
const layout=readFileSync(new URL('../src/components/Layout.tsx',import.meta.url),'utf8');
const categories=new Set(['chap','beef','grill','naan','rice','salad','drinks','shakes','coffee','juice','dessert','special','sides']);

test('the source menu has 93 unique dishes: 56 published and 37 historical admin drafts',()=>{
 assert.equal(catalog.length,93);
 assert.equal(new Set(catalog.map(i=>i.id)).size,catalog.length);
 assert.equal(catalog.filter(i=>i.active).length,56);
 assert.equal(catalog.filter(i=>!i.active).length,37);
});

test('all catalog records use valid database categories and safe price types',()=>{
 for(const item of catalog){
  assert.ok(categories.has(item.category),item.name);
  assert.ok(item.id.match(/^[a-z0-9-]+$/),item.id);
  assert.ok(item.name.trim()&&item.name_bn.trim(),item.name);
  assert.ok(item.price===null||(Number.isSafeInteger(item.price)&&item.price>0&&item.price<1000000),item.name);
  assert.ok(Number.isSafeInteger(item.sort_order)&&item.sort_order>0);
  if(!item.active)assert.equal(item.available,false,`Draft must not be orderable: ${item.id}`);
 }
 assert.equal(catalog.filter(i=>i.active&&i.price===null).length,9);
});

test('photo-transcribed reference prices are consistent',()=>{
 const prices=new Map(catalog.map(i=>[i.id,i.price]));
 assert.equal(prices.get('chicken-chap'),180);
 assert.equal(prices.get('beef-chap'),230);
 assert.equal(prices.get('naan'),40);
 assert.equal(prices.get('espresso'),150);
 assert.equal(prices.get('iced-mocha'),280);
 assert.equal(prices.get('chocolate-milk-shake'),null);
});

test('database seed contains all menu rows and does not delete or overwrite priced existing dishes',()=>{
 for(const item of catalog)assert.ok(sql.includes(`'${item.id}'`),item.id);
 assert.ok(sql.includes('where public.menu_items.price is null'));
 assert.ok(sql.includes("on conflict (id) do update"));
 assert.ok(!/\bdelete\s+from\b/i.test(sql));
 assert.ok(!/\bdrop\s+table\b/i.test(sql));
 assert.ok(!/set\s+accepting_orders\s*=\s*true/i.test(sql));
});

test('the recreated logo and icon exist and are used by the React header and footer',()=>{
 const logo=new URL('../public/brand/chap-khana-logo.png',import.meta.url);
 assert.ok(statSync(logo).size>10000);
 assert.ok(statSync(new URL('../public/favicon.png',import.meta.url)).size>1000);
 assert.ok(layout.includes('/brand/chap-khana-logo.png'));
});

const imageSql = readFileSync(new URL('../supabase/migrations/05_reference_food_images.sql',import.meta.url),'utf8');
const imageSources = readFileSync(new URL('../docs/FOOD-IMAGE-SOURCES.csv',import.meta.url),'utf8');
const dishCard = readFileSync(new URL('../src/components/DishCard.tsx',import.meta.url),'utf8');
const fallback = readFileSync(new URL('../src/data/referenceImages.ts',import.meta.url),'utf8');

test('every public dish and admin draft has a secure, attributable food reference photograph',()=>{
 const urls=new Set();
 for(const item of catalog){
  const u=new URL(item.image_url);
  assert.equal(u.protocol,'https:',item.name);
  assert.equal(u.hostname,'images.unsplash.com',item.name);
  assert.ok(u.pathname.startsWith('/photo-'),item.name);
  urls.add(item.image_url);
  assert.ok(imageSources.includes(`"${item.id}"`) || imageSources.includes(`\n${item.id},`) || imageSources.includes(`,${item.id},`),item.id);
 }
 assert.ok(urls.size>=50,`Expected at least 50 varied reference photos, found ${urls.size}`);
});

test('image-only migration preserves owner photos and never changes menu prices, orders or availability',()=>{
 assert.match(imageSql,/update public\.menu_items as m/i);
 assert.match(imageSql,/set image_url = c\.image_url/i);
 assert.match(imageSql,/m\.image_url is null or btrim\(m\.image_url\) = ''/);
 assert.doesNotMatch(imageSql,/\bdelete\s+from\b|\bdrop\s+table\b/i);
 assert.doesNotMatch(imageSql,/\bset\s+(?:price|available|active|accepting_orders)\b/i);
 for (const item of catalog)assert.ok(imageSql.includes(`'${item.id}'`), item.id);
});

test('React product cards prefer owner photos, fall back to catalog photos, and avoid repeating the brand logo',()=>{
 assert.match(dishCard,/validImage\(item\.image_url\)/);
 assert.match(dishCard,/referenceImageFor\(item\.id\)/);
 assert.match(dishCard,/onError=/);
 assert.match(dishCard,/ILLUSTRATIVE PHOTO/);
 assert.doesNotMatch(dishCard,/dish-brand-watermark/);
 assert.match(fallback,/menu-catalog\.json/);
});
