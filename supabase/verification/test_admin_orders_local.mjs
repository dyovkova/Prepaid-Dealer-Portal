// Native disposable PostgreSQL 17, loopback only. No hosted credentials or writes.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { setupOrderTests, sqlFile, fixture, asDealer, submit } from './order_test_support.mjs';
import { testAdminProducts } from './admin_product_checks.mjs';
import { member, testAdminDealers } from './admin_dealer_checks.mjs';
import { testConcurrency } from './test_order_concurrency.mjs';
import { testDealerManagementConcurrency } from './admin_dealer_concurrency.mjs';
import { testAdminOrders } from './admin_order_checks.mjs';
import { testAdminOrderConcurrency } from './admin_order_concurrency.mjs';

const { default: EmbeddedPostgres } = await import(new URL('../../.verification/order-sql-tools/node_modules/embedded-postgres/dist/index.js', import.meta.url));
const root = resolve(import.meta.dirname, '../../.verification'), databaseDir = mkdtempSync(resolve(root, 'admin-orders-pg-'));
const conflictCode = 'PT409';
assert.equal(resolve(databaseDir, '..'), root);
const cluster = new EmbeddedPostgres({ databaseDir, user: 'postgres', password: randomBytes(32).toString('hex'),
  authMethod: 'scram-sha-256', port: 56440, persistent: true, createPostgresUser: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
let db, started = false;
const rows = async sql => (await db.query(sql)).rows;
const snapshot = async () => ({
  auth: await rows('SELECT * FROM auth.users ORDER BY id'), profiles: await rows('SELECT * FROM public.profiles ORDER BY id'),
  roles: await rows('SELECT * FROM public.user_roles ORDER BY user_id'), dealers: await rows('SELECT * FROM public.dealers ORDER BY id'),
  products: await rows('SELECT * FROM public.products ORDER BY id'), orders: await rows('SELECT * FROM public.orders ORDER BY id'),
  items: await rows('SELECT * FROM public.order_items ORDER BY order_id,product_id'),
  functions: await rows("SELECT n.nspname,p.proname,p.prosrc,p.proacl,p.proconfig,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') ORDER BY n.nspname,p.proname"),
  policies: await rows("SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname"),
});
try {
  await cluster.initialise(); await cluster.start(); started = true;
  db = cluster.getPgClient('postgres', '127.0.0.1'); await db.connect(); await db.query("SET statement_timeout='15s'");
  console.log((await rows('SELECT version()'))[0].version);
  const products = await setupOrderTests(db);
  await db.query(await sqlFile('test_catalog_access.sql')); await db.query(await sqlFile('test_atomic_orders.sql'));
  for (const file of ['20261121000500_order_read_access.sql', '20261121000600_admin_product_access.sql', '20261121000700_admin_dealer_access.sql']) await db.query(await sqlFile('../migrations/' + file));
  await testAdminProducts(db, products);
  await db.query('SET ROLE supabase_auth_admin');
  await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3)', [member, 'colleague@example.invalid', { display_name: 'Synthetic colleague', business_name: 'Local 10A fixture' }]);
  await db.query('RESET ROLE'); await db.query('UPDATE public.profiles SET dealer_id=(SELECT dealer_id FROM public.profiles WHERE id=$1) WHERE id=$2', [fixture.a, member]);
  for (const actor of [fixture.a, member, fixture.b]) {
    await asDealer(db, actor); await submit(db, randomUUID(), [{ product_id: products[0].id, quantity: 2 }], 'Synthetic pre-10A order');
  }
  await db.query('RESET ROLE'); const before = await snapshot(); await testAdminDealers(db, before, products);
  await db.query(await sqlFile('../migrations/20261122000800_admin_order_access.sql'));
  await db.query(await sqlFile('../migrations/20261122000900_admin_order_conflict_response.sql'));
  const migrated = await snapshot();
  for (const key of ['auth', 'profiles', 'roles', 'dealers', 'products', 'orders', 'items']) assert.deepEqual(migrated[key], before[key]);
  assert.deepEqual(migrated.functions.filter(f => f.proname !== 'transition_order_status'), before.functions);
  assert.deepEqual(migrated.policies.filter(p => p.policyname !== 'orders_read_active_admin'), before.policies);
  await testAdminOrders(db, before, products, conflictCode); assert.deepEqual(await snapshot(), migrated);
  const functions = await rows(`SELECT n.nspname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
    EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='transition_order_status' ORDER BY n.nspname`);
  assert.equal(functions.length, 2);
  for (const f of functions) {
    assert.equal(f.owner, 'postgres'); assert.deepEqual(f.proconfig, ['search_path=""']);
    assert.equal(f.anon, false); assert.equal(f.public, false); assert.equal(f.authenticated, true); assert.equal(f.prosecdef, f.nspname === 'private');
  }
  const grants = await rows(`SELECT c.relrowsecurity,has_table_privilege('authenticated',c.oid,'SELECT') AS read,
    has_table_privilege('anon',c.oid,'SELECT') AS anon,has_any_column_privilege('authenticated',c.oid,'INSERT,UPDATE') AS writes,
    has_table_privilege('authenticated',c.oid,'DELETE,TRUNCATE') AS deletes
    FROM pg_class c WHERE c.oid IN ('public.orders'::regclass,'public.order_items'::regclass)`);
  assert.ok(grants.every(g => g.relrowsecurity && g.read && !g.anon && !g.writes && !g.deletes));
  console.log('PASS migration changes no rows/old functions/old policies; exact rollback; invoker/definer ownership, empty search paths, explicit execution ACLs and SELECT-only table grants');
  await testAdminOrderConcurrency(cluster, db, products, conflictCode);
  await testDealerManagementConcurrency(cluster, db, products); await testConcurrency(cluster, db, products);
  const after = await snapshot();
  for (const key of ['auth', 'profiles', 'roles', 'dealers', 'products', 'functions', 'policies']) assert.deepEqual(after[key], migrated[key]);
  for (const key of ['orders', 'items']) for (const row of before[key]) assert.ok(after[key].some(item => JSON.stringify(item) === JSON.stringify(row)));
  console.log('PASS post-10A admin/dealer activation and atomic submission concurrency regressions; original local historical rows, identities, products and all security definitions preserved');
} finally { await db?.end(); if (started) await cluster.stop(); }
