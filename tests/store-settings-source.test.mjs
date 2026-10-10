import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const sql=read('supabase/migrations/07_restaurant_profile_hours.sql');
const fields=read('src/components/RestaurantSettingsForm.tsx');
const home=read('src/pages/Home.tsx');
const layout=read('src/components/Layout.tsx');
const api=read('src/data/api.ts');
const admin=read('src/pages/Admin.tsx');

test('new profile migration adds opening hours and social fields without destructive DDL',()=>{
  for(const col of ['contact_phone','whatsapp_phone','address_text','maps_url','facebook_url','instagram_url','weekly_hours','hours_note','announcement','dine_in_enabled'])
    assert.match(sql,new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`));
  assert.doesNotMatch(sql,/\b(drop\s+table|delete\s+from|truncate\s+table|update\s+public\.orders)\b/i);
  assert.match(sql,/11:59/);assert.match(sql,/23:59/);
  assert.match(sql,/store_settings_profile_valid/);
});
test('SQL retains existing staff RLS and checkout control',()=>{
  assert.doesNotMatch(sql,/create\s+policy|alter\s+table\s+public\.orders|grant\s+update\s+on/i);
  assert.match(sql,/does NOT automatically pause\/enable online checkout/i);
  assert.match(api,/\.select\('id'\)\.single\(\)/);
});
test('admin settings form supports all required contact and hours fields',()=>{
  for(const field of ['contact_phone','address_text','maps_url','facebook_url','whatsapp_phone','instagram_url','hours_note','announcement','weekly_hours','dine_in_enabled']) assert.ok(fields.includes(field),field);
  assert.match(admin,/settingsDirty\.current/);
  assert.match(fields,/WEEK_DAYS\.map/);
});
test('customer storefront and footer use dynamic Supabase settings',()=>{
  assert.match(home,/settings\.address_text/);assert.match(home,/settings\.contact_phone/);
  assert.match(home,/RestaurantHours/);assert.match(home,/settings\.facebook_url/);
  assert.match(layout,/settings\.announcement/);assert.match(layout,/settings\.facebook_url/);
  assert.match(layout,/RestaurantHours/);
  assert.doesNotMatch(layout,/config\.phone|config\.address|config\.maps/);
});
