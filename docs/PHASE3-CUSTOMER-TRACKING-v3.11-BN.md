# Chap Khana v3.11 — Customer Order Confirmation & Tracking

## কী যোগ হয়েছে

- Checkout সফল হলে `/order-confirmation` page দেখাবে। এখানে order number, database-returned total, pickup/delivery method, requested dish/quantity, private tracking link, copy এবং print action আছে।
- Confirmation একই browser tab-এ ২৪ ঘণ্টা পর্যন্ত মনে রাখে। Phone, address, notes, email এখানে সংরক্ষিত হয় না। Tab বন্ধ করলে sessionStorage হারিয়ে যেতে পারে। এটি **order database-এর বিকল্প নয়**।
- `/track?token=...` page-এ pickup ও delivery আলাদা timeline দেখায়। Restaurant staff যে status দিয়েছে, সেটিই দেখা যাবে; ETA তৈরি করা হয় না।
- Page খোলা ও visible থাকলে প্রতি ৩০ সেকেন্ডে refreshed status দেখার চেষ্টা করে। Completed/cancelled-এ auto refresh বন্ধ থাকে। Refresh status button সবসময় আছে।
- Private pages noindex এবং `Referrer-Policy: no-referrer`; tracking token পাবলিকভাবে শেয়ার করা উচিত নয়।

## Setup

এই update-এর জন্য কোনো নতুন Supabase SQL লাগবে না। আগের migration `08`, `09`, `10` pending থাকলে নিজ নিজ feature-এর জন্য তা পরে লাগবে। `/order-confirmation`-এর Vercel SPA rewrite আগের configuration-এ covered; extra private-route robots header যোগ হয়েছে।

## Codespaces commands

```bash
cd /workspaces/Chap-Khana
ls -lh Chap-Khana-v3.11.0-Customer-Experience-Patch.zip
unzip -o Chap-Khana-v3.11.0-Customer-Experience-Patch.zip -d /tmp/chap-v311
test -f /tmp/chap-v311/Chap-Khana/package.json && rsync -av --exclude='.git/' --exclude='node_modules/' --exclude='.env.local' /tmp/chap-v311/Chap-Khana/ ./
node -p "require('./package.json').version"
npm ci
npm run test:catalog
npm test
npm run build
npm audit --omit=dev
```

Build pass করার পর ZIP remove করে `git status`, `git add -A`, `git commit`, `git push` করবে। `.env.local`/other secrets commit করা যাবে না।

## Manual QA (important)

1. Menu থেকে priced item cart-এ যোগ করে checkout দাও। Demo হলে demo flag দেখাবে; live হলে Supabase-এ `place_order_v2` দ্বারা order create হতে হবে।
2. Confirmation-এ **database-returned total** ও order reference দেখছে কিনা যাচাই করো। Receipt print preview দেখে নাও।
3. Page refresh করো: একই tab-এ confirmation থাকতে হবে। অন্য browser/tab-এ receipt দেখা যাবে না; tracking link থাকলে token দিয়েই track করা যাবে।
4. Copy tracking link, open tracking page, manual refresh পরীক্ষা করো।
5. Admin status `pending → confirmed → preparing → ready → completed` করে pickup timeline পরীক্ষা করো।
6. Delivery flow-এ `out_for_delivery` step পরীক্ষা করো; pickup flow-এ এটি থাকা যাবে না।
7. Cancelled order যেন completed দেখায় না। Browser visible থাকলে ৩০ সেকেন্ডে refresh; hidden tab-এ polling থেমে যায়।
8. Regular customer কখনো admin-only order details দেখতে পারে কি না RLS দিয়ে verify করো। New code database permissions বদলায়নি।

## Notes

This version does not send SMS, WhatsApp, email confirmations or browser push notifications. It does not promise a delivery ETA. Some browsers restrict clipboard writes; use the tracking page address manually if copying is blocked. A successful static build does not verify a real Supabase checkout without credentials and test orders.

Documentation: [React Router](https://reactrouter.com/) · [Supabase JS](https://supabase.com/docs/reference/javascript/introduction) · [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) · [MDN Referrer Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy).
