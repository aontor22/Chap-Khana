import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const home=read('../src/pages/Home.tsx');
const layout=read('../src/components/Layout.tsx');
const cards=read('../src/components/DishCard.tsx');
const seo=read('../src/lib/seo.ts');
const vercel=JSON.parse(read('../vercel.json'));
test('Menu progressively renders the filtered results and keeps full-catalog search',()=>{
 assert.match(home,/filtered\.slice\(0,visibleMenuCount/);
 assert.match(home,/nextMenuCount/);
 assert.match(home,/setVisibleCount\(MENU_PAGE_SIZE\)/);
 assert.match(home,/search\.trim\(\)\.toLowerCase\(\)/);
});
test('Mobile cart shortcut uses live cart totals and safe-area padding',()=>{
 assert.match(layout,/count>0/);
 assert.match(layout,/subtotal\.toLocaleString/);
 assert.match(layout,/to="\/cart" className="mobile-cart-bar"/);
 assert.match(read('../src/styles/index.css'),/safe-area-inset-bottom/);
});
test('Food photos preserve lazy loading, dimensions and fallback',()=>{
 assert.match(cards,/loading="lazy"/);
 assert.match(cards,/width=\{800\} height=\{550\}/);
 assert.match(cards,/referenceImageFor\(item\.id\)/);
});
test('SEO identifies private pages and duplicate menu canonical',()=>{
 assert.match(seo,/indexable: false/);
 assert.match(seo,/canonicalPath: '\/'/);
 assert.match(read('../src/components/PageMeta.tsx'),/setMeta\('robots'/);
 assert.ok(existsSync(new URL('../public/robots.txt',import.meta.url)));
 assert.ok(existsSync(new URL('../public/sitemap.xml',import.meta.url)));
 const sources=vercel.headers.map(x=>x.source);
 for (const route of ['/account','/admin','/checkout','/cart','/track','/auth/callback']) assert.ok(sources.includes(route),route);
 assert.ok(vercel.rewrites[0].source.includes('robots'));
});
