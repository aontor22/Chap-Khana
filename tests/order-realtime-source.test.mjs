import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root=new URL('../',import.meta.url);
const src=p=>readFileSync(new URL(p,root),'utf8');

test('Realtime stream uses existing authenticated orders table, no broadcast PII',()=>{
 const hook=src('src/hooks/useAdminOrderAlerts.ts');
 assert.match(hook,/if \(!enabled \|\| !live \|\| !supabase \|\| !ready \|\| !userId\) return/);
 assert.match(hook,/postgres_changes/);
 assert.match(hook,/table: 'orders'/);
 assert.match(hook,/event: 'INSERT'/);
 assert.match(hook,/removeChannel\(channel\)/);
 assert.doesNotMatch(hook,/service_role|sb_secret|broadcast\(/i);
});
test('20-second polling survives absent Realtime publication',()=>{
 const hook=src('src/hooks/useAdminOrderAlerts.ts');
 assert.match(hook,/setInterval\(\(\) => \{ void refreshOrders\(\); \}, 20_000\)/);
 assert.match(hook,/scopeRef\.current/);
 assert.match(hook,/reconcileOrderSnapshot/);
});
test('staff UI has opt-in sound, accessible new-order notice and unread count',()=>{
 const admin=src('src/pages/Admin.tsx');
 assert.match(admin,/useAdminOrderAlerts/);
 assert.match(admin,/toggleSound/);
 assert.match(admin,/role="alert" aria-live="polite"/);
 assert.match(admin,/unread\.length/);
 assert.match(admin,/markRead/);
});
test('optional migration is RLS-preserving and does not change checkout',()=>{
 const sql=src('supabase/migrations/09_admin_order_realtime.sql');
 assert.match(sql,/ALTER PUBLICATION supabase_realtime ADD TABLE public\.orders/i);
 assert.match(sql,/pg_publication_tables/);
 assert.doesNotMatch(sql,/DROP\s+(TABLE|POLICY)|GRANT\s+SELECT\s+ON\s+public\.orders|DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});
