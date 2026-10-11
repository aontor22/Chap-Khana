# Chap Khana v3.9 — Admin Food Photo Upload / বাংলা Guide

## কী যোগ হয়েছে

Admin → Menu → Edit dish → Dish photo: JPG, PNG বা WebP ছবি select, preview, replace, cancel selection এবং **Use reference photo**। নতুন খাবার যোগ করার সময়ও upload করা যাবে। Upload শুধুমাত্র **Save dish** চাপলে হবে। Admin ছাড়া কেউ Supabase Storage-এ ছবি upload/delete করতে পারবে না।

- Source maximum 6 MB, application browser-এ ছবির aspect ratio রেখে maximum 1400px পর্যন্ত resize করে WebP বানায়; optimized maximum 3 MB.
- Storage bucket: `chap-khana-menu-images` (public download, restricted writes). ছবিতে কোনো customer data বা personal document দেবে না।
- Existing menu item price/discount/order history unchanged.
- Reference Unsplash photo URL অন্য কোনো server থেকে delete হয় না। নতুন photo save হওয়ার **পরে** পুরোনো restaurant-uploaded object best-effort cleanup হয়।
- Database save fail করলে newly uploaded object delete-এর চেষ্টা হয়; cleanup network failure হলে Supabase Storage dashboard থেকে পরে manually remove করতে হতে পারে।
- Upload disabled in browser-local Demo mode. External HTTPS photo URLs can still be used in Demo.

## SQL order

আগের 01/03/04/05/06/07/08 সফল থাকলে **নতুন শুধু** `supabase/migrations/10_menu_image_storage.sql` Supabase SQL Editor-এ Run করো। SQL 09 (Realtime) আলাদাভাবে লাগতে পারে, কিন্তু photo upload-এর জন্য বাধ্যতামূলক নয়। SQL 08 production security audit pending থাকলে আগে সেটি apply/test করো।

Migration SQL নতুন bucket ও Storage policies তৈরি করে। `public.menu_items`, order, discount, existing `image_url` modify করে না। Existing real orders delete হবে না।

### Verify bucket / policies (SQL Editor)

```sql
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'chap-khana-menu-images';

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
AND policyname LIKE 'chap_khana_staff_menu_photo_%'
ORDER BY policyname;
```

Expected: public bucket, 3145728 byte limit, `image/webp`; staff policies for INSERT / SELECT / DELETE. Test upload with real authorized admin session from website, not SQL Editor's privileged account. A customer account must fail to upload.

## Deploy / Codespaces

1. Download **Patch ZIP** and upload it to Codespaces repo root.
2. Run (check ZIP exact filename):

```bash
cd /workspaces/Chap-Khana
ls -lh Chap-Khana-v3.9.0-Menu-Photo-Upload-Patch.zip
mkdir -p /tmp/chap-v39
unzip -o Chap-Khana-v3.9.0-Menu-Photo-Upload-Patch.zip -d /tmp/chap-v39
find /tmp/chap-v39 -maxdepth 2 -type d
rsync -av --exclude='.env.local' --exclude='.git/' --exclude='node_modules/' /tmp/chap-v39/Chap-Khana/ ./
node -p "require('./package.json').version"
npm ci
npm run test:catalog
npm test
npm run build
npm run audit:production
```

3. Check for `3.9.0` and no build errors. **Before publishing new upload functionality, apply SQL 10 to staging then production.** If database is unavailable, source code will deploy but live upload buttons will fail until SQL 10 runs; older menu/cart functionality is unaffected.
4. Remove ZIP from repository and push:

```bash
rm -f Chap-Khana-v3.9.0-Menu-Photo-Upload-Patch.zip
git status --short
git add src/ tests/ supabase/ docs/ package.json package-lock.json CHANGELOG-v3.md README.md START-HERE-BN.md
git commit -m "Add secure admin menu photo uploads v3.9"
git push origin main
```

## Manual QA

- [ ] Approved staff can select JPG/PNG/WebP, preview it, and Save Dish.
- [ ] On site refresh, dish displays uploaded image; label says **Restaurant Photo**.
- [ ] Replacing image preserves price/discount and storage has no unexpected duplicates (successful cleanup).
- [ ] **Use reference photo** then Save returns the catalog reference image.
- [ ] Cancel dialog or cancel file selection does not create a Storage object.
- [ ] Non-admin customer cannot upload or delete objects; the Admin menu is not accessible.
- [ ] A 7MB JPG, SVG and invalid file show validation errors.
- [ ] Deliberately test a database-save failure in staging: new upload should be deleted; old photo should remain.
- [ ] Existing food ordering, discounts, Google Login and order notifications still work.

## Security notes

A public photo URL is meant to be visible to everyone. Only authorized staff can write/delete objects based on `public.admin_users` through Storage RLS. This is different from allowing customers to read images. Never put service role keys inside frontend `.env` or expose customer/private files in this bucket. Before production, verify policies in the live project and test unauthorized accounts.

See https://supabase.com/docs/guides/storage/security/access-control and https://supabase.com/docs/guides/storage/buckets/fundamentals.
