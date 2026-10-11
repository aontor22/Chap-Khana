import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../supabase/migrations/08_launch_security.sql', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

test('Security migration is transactional, dependency-checked and non-destructive', () => {
  assert.match(text,/\bBEGIN\s*;/i);
  assert.match(text,/\bCOMMIT\s*;/i);
  assert.match(text,/to_regprocedure\('private\.is_valid_weekly_hours\(jsonb\)'\)/i);
  assert.match(text,/to_regprocedure\('public\.place_order_v2\(/i);
  assert.doesNotMatch(text,/\b(?:drop\s+table|truncate\s+table|delete\s+from|update\s+public\.menu_items|update\s+public\.orders\s+set)\b/i);
});

test('Legacy order RPC is no longer executable by guests or customers', () => {
  assert.match(text,/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.place_order\(text,text,text,text,text,jsonb\)/i);
  assert.match(text,/FROM\s+PUBLIC,\s*anon,\s*authenticated/i);
  assert.match(text,/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+private\.place_order_impl\(text,text,text,text,text,jsonb\)/i);
  assert.match(text,/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.place_order_v2\(text,text,text,text,text,jsonb,uuid\)/i);
  assert.match(text,/has_function_privilege\('anon','public\.place_order\(/i);
});

test('Staff hours validator can execute without relaxing the staff-only table policy', () => {
  assert.match(text,/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+private\.is_valid_weekly_hours\(jsonb\)\s+TO\s+authenticated/i);
  assert.match(text,/GRANT\s+UPDATE\(status\)\s+ON\s+TABLE\s+public\.orders\s+TO\s+authenticated/i);
  assert.doesNotMatch(text,/\b(?:disable\s+row\s+level\s+security|grant\s+update\s+on\s+(?:table\s+)?public\.store_settings\s+to\s+anon)\b/i);
});

test('Version and CI security checks are in sync', () => {
  assert.equal(pkg.version,'3.6.0');
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].version,pkg.version);
  assert.match(pkg.scripts['test:catalog'],/launch-security\.test\.mjs/);
  assert.match(workflow,/npm ci/);
  assert.match(workflow,/npm run audit:production/);
});
