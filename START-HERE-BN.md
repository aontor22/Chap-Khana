# Chap Khana React 2.0 — বাংলা Setup

## ১. Technology
React 19 + TypeScript + Vite + Tailwind CSS + Supabase PostgreSQL + Supabase Auth / Google OAuth + Vercel.
**Render আলাদা backend হিসেবে লাগছে না।** Render Static Site হিসেবে বিকল্প হতে পারে।

## ২. Local Run
```bash
npm install
npm run dev
npm run build
npm test
```
`.env.local` না থাকলে DEMO mode (browser-local orders) চালু হবে। এটি সত্যিকারের ordering নয়।

## ৩. Supabase SQL
- **নতুন project:** `supabase/01_fresh_schema.sql`, তারপর `supabase/migrations/03_production_hardening.sql` চালাও।
- **পুরোনো Chap Khana + Google ইতোমধ্যেই enabled:** শুধু `supabase/migrations/03_production_hardening.sql` চালাও।
- **পুরোনো Chap Khana, Google upgrade হয়নি:** `supabase/02_existing_google_upgrade.sql`, এরপর `03_production_hardening.sql` চালাও।
- Data নষ্ট হওয়ার ঝুঁকি কমাতে আগে database backup নাও, staging-এ test করো।
- SQL চালানোর পর `place_order_v2` এবং `track_order` RPC দেখা যাচ্ছে কি না যাচাই করো।
- `accepting_orders` শুরুতে false-ই থাকবে; real prices যাচাই করে তারপর activation।

## ৪. Config
Root-এ `.env.local` তৈরি করো:
```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
**শুধু public/publishable key** ব্যবহার করবে। `service_role`, `sb_secret`, database password, Google Client Secret frontend-এ দেওয়া যাবে না।

## ৫. Google Login
Google Cloud Console → OAuth Web Client → Redirect URI:
`https://YOUR_PROJECT.supabase.co/auth/v1/callback`

Supabase Dashboard → Authentication → Providers → Google: Google Client ID + Secret দেবে।
Supabase → Authentication → URL Configuration:
- Site URL: `https://YOUR_SITE.vercel.app`
- Redirect URLs: `https://YOUR_SITE.vercel.app/auth/callback`
- Local testing: `http://localhost:5173/auth/callback`

একবার owner-এর Google account দিয়ে login করে Supabase SQL Editor থেকে staff grant দাও:
```sql
insert into public.admin_users(user_id)
select id from auth.users where lower(email)=lower('OWNER@gmail.com')
on conflict(user_id) do nothing;
```

## ৬. Vercel Deploy
GitHub-এ folder-এর **ভেতরের সব files** push করো → Vercel Import → Framework Vite → Build `npm run build` → Output `dist` → Environment Variables-এ `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` বসাও → Deploy।

## ৭. Render (Optional)
Render → New → Static Site → Build `npm install && npm run build` → Publish `dist` → env variables same। এটা Vercel-এর alternative; একসঙ্গে দুই hosting বাধ্যতামূলক নয়।

## ৮. গুরুত্বপূর্ণ Production Warning
- Menu/price/image **নমুনা**; আসল restaurant owner confirm না করা পর্যন্ত real order enable করো না।
- React dashboard-এ admin লিংক গোপন করাই নিরাপত্তা নয়; Supabase RLS + admin_users permission নিশ্চিত করো।
- Payment gateway নেই, শুধু cash on pickup/delivery।
- Browser থেকে অর্ডারের মূল্য বদলালে server price ব্যবহার হবে। `place_order_v2` retry-এর জন্য idempotency key নেয়।
- Rate limiting-এর জন্য basic per-phone limit আছে, কিন্তু **CAPTCHA + Edge/IP limiter**, monitoring, backup, privacy/cancellation policy ছাড়া fully public commercial order নেওয়া উচিত নয়।
- Real Google OAuth / Supabase permission / payment test করার জন্য তোমার নিজস্ব project configure করতে হবে।

Full feature matrix ও developer notes: `README.md`।
