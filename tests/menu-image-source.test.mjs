import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = path => readFileSync(new URL(path,import.meta.url),'utf8');
const sql=source('../supabase/migrations/10_menu_image_storage.sql');
const admin=source('../src/pages/Admin.tsx');
const component=source('../src/components/MenuImageUpload.tsx');
const imageStorage=source('../src/lib/menuImageStorage.ts');
const dish=source('../src/components/DishCard.tsx');
test('Storage SQL creates only the menu image bucket with limited MIME and file size',()=>{
  assert.match(sql,/INSERT INTO storage\.buckets/);
  assert.match(sql,/3145728/);
  assert.match(sql,/ARRAY\['image\/webp'\]/);
  assert.match(sql,/BEGIN;/);
  assert.match(sql,/COMMIT;/);
  assert.doesNotMatch(sql,/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\s+public\.menu_items\b/i);
});
test('Storage writes and deletes are staff-only and path restricted',()=>{
  assert.match(sql,/FOR INSERT TO authenticated/);
  assert.match(sql,/FOR DELETE TO authenticated/);
  assert.match(sql,/FROM public\.admin_users au/);
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/name ~ '\^items\//);
  assert.doesNotMatch(sql,/TO anon|FOR UPDATE/);
});
test('Admin image selection and rollback respect the save boundary',()=>{
  assert.match(admin,/uploadMenuImage\(pendingImage,id\)/);
  assert.match(admin,/await saveMenuItem\(nextItem\)/);
  assert.match(admin,/if\(uploaded && !saved\)/);
  assert.match(admin,/managedMenuImagePath\(previous,id,config\.supabaseUrl\)/);
  assert.match(admin,/<MenuImageUpload/);
  assert.match(component,/type="file"/);
  assert.match(component,/URL\.revokeObjectURL\(url\)/);
});
test('Images are optimized to WebP, never overwritten, and deletion is scoped',()=>{
  assert.match(imageStorage,/image\/webp/);
  assert.match(imageStorage,/upsert:false/);
  assert.match(imageStorage,/managedMenuImagePath\(url,itemId,config\.supabaseUrl\)/);
  assert.match(dish,/RESTAURANT PHOTO/);
  assert.match(dish,/ILLUSTRATIVE PHOTO/);
  assert.match(dish,/failedUrls\.includes\(preferredUrl\)/);
  assert.match(dish,/referenceImageFor\(item\.id\)/);
});
