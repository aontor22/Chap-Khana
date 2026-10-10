import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('staff lookup is centralized in the shop context and tied to signed-in user ID',()=>{
  const context=read('../src/context/ShopContext.tsx');
  assert.match(context,/isStaff\(user\.id\)/);
  assert.match(context,/roleLookup\?\.userId!==user\.id/);
  assert.match(context,/setRoleLookup\(null\)/);
  assert.doesNotMatch(context,/user_metadata\?\.role|email\?\.includes\(['"]admin/);
});
test('desktop/mobile links and footer do not show staff access to unapproved live visitors',()=>{
  const layout=read('../src/components/Layout.tsx');
  assert.match(layout,/const showAdmin=adminStatus==='allowed'&&\(Boolean\(user\)\|\|!live\)/);
  assert.match(layout,/<Link to="\/admin" className="admin-shortcut/);
  assert.match(layout,/\{showAdmin&&<NavItem to="\/admin"/);
  assert.match(layout,/\{showAdmin&&<Link to="\/admin"/);
});
test('account page exposes a dashboard CTA and a manual permission refresh',()=>{
  const account=read('../src/pages/Account.tsx');
  assert.match(account,/adminStatus==='allowed'/);
  assert.match(account,/<Link to="\/admin" className="admin-account-action"/);
  assert.match(account,/refreshAdminAccess\(\)/);
});
test('staff dashboard reuses the same allowlist check and handles errors',()=>{
  const admin=read('../src/pages/Admin.tsx');
  assert.match(admin,/permitted=adminStatus==='allowed'/);
  assert.doesNotMatch(admin,/(?:await |\b)isStaff\(user/);
  assert.match(admin,/adminStatus==='error'/);
  assert.match(admin,/setOrders\(\[\]\)/);
});
