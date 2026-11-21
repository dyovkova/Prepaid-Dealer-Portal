// Native PostgreSQL 17 on loopback only. No hosted connection or credentials.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { setupOrderTests, sqlFile, asDealer, submit } from './order_test_support.mjs';
import { testAdminProducts } from './admin_product_checks.mjs';
import { testConcurrency } from './test_order_concurrency.mjs';

const { default: EmbeddedPostgres } = await import(new URL(
  '../../.verification/order-sql-tools/node_modules/embedded-postgres/dist/index.js', import.meta.url));
const root = resolve(import.meta.dirname, '../../.verification');
const databaseDir = mkdtempSync(resolve(root, 'admin-products-pg-'));
assert.equal(resolve(databaseDir, '..'), root);
const cluster = new EmbeddedPostgres({ databaseDir, user: 'postgres', password: randomBytes(32).toString('hex'),
  authMethod: 'scram-sha-256', port: 56438, persistent: true, createPostgresUser: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
let db, started = false;
const rows = async sql => (await db.query(sql)).rows;
const functions = () => rows(`SELECT n.nspname,p.proname,p.prosrc,p.proacl,p.proconfig,p.prosecdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') ORDER BY n.nspname,p.proname`);
const nonproductPolicies = () => rows("SELECT * FROM pg_policies WHERE schemaname='public' AND tablename<>'products' ORDER BY tablename,policyname");
try {
  await cluster.initialise(); await cluster.start(); started = true;
  db = cluster.getPgClient('postgres', '127.0.0.1'); await db.connect();
  await db.query("SET statement_timeout='30s'");
  console.log((await rows('SELECT version()'))[0].version);
  const products = await setupOrderTests(db);
  await db.query(await sqlFile('test_catalog_access.sql'));
  await db.query(await sqlFile('test_atomic_orders.sql'));
  await db.query(await sqlFile('../migrations/20261121000500_order_read_access.sql'));
  await asDealer(db);
  await submit(db, randomUUID(), [{ product_id: products.find(p => p.sku === 'PDP-DEMO-CREDIT-005').id, quantity: 1 }], 'Synthetic pre-8A history');
  await db.query('RESET ROLE');
  const original = { functions: await functions(), policies: await nonproductPolicies(),
    orders: await rows('SELECT * FROM public.orders'), items: await rows('SELECT * FROM public.order_items'),
    profiles: await rows('SELECT * FROM public.profiles ORDER BY id'), roles: await rows('SELECT * FROM public.user_roles ORDER BY user_id'),
    constraints: await rows("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.products'::regclass ORDER BY conname") };
  await db.query(await sqlFile('../migrations/20261121000600_admin_product_access.sql'));
  await testAdminProducts(db, products);
  assert.deepEqual(await rows('SELECT * FROM public.products ORDER BY sku'), products);
  assert.deepEqual(await rows('SELECT * FROM public.profiles ORDER BY id'), original.profiles);
  assert.deepEqual(await rows('SELECT * FROM public.user_roles ORDER BY user_id'), original.roles);
  assert.deepEqual(await rows('SELECT * FROM public.orders'), original.orders);
  assert.deepEqual(await rows('SELECT * FROM public.order_items'), original.items);
  assert.deepEqual(await functions(), original.functions); assert.deepEqual(await nonproductPolicies(), original.policies);
  assert.deepEqual(await rows("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.products'::regclass ORDER BY conname"), original.constraints);
  const columns = await rows(`SELECT attname,
    has_column_privilege('authenticated',attrelid,attnum,'INSERT') AS insertable,
    has_column_privilege('authenticated',attrelid,attnum,'UPDATE') AS editable
    FROM pg_attribute WHERE attrelid='public.products'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`);
  for (const column of columns) {
    const editable = ['sku', 'name', 'description', 'unit_price', 'is_active'].includes(column.attname);
    assert.equal(column.insertable, editable); assert.equal(column.editable, editable);
  }
  assert.ok((await rows(`SELECT relrowsecurity,
    has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS anon_access,
    has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') AS table_writes
    FROM pg_class WHERE oid='public.products'::regclass`)).every(r => r.relrowsecurity && !r.anon_access && !r.table_writes));
  assert.deepEqual((await rows("SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='products' ORDER BY policyname")).map(p => p.policyname),
    ['products_insert_active_admin', 'products_read_active_admin', 'products_read_active_dealer', 'products_update_active_admin']);
  console.log('PASS exact column grants, unchanged dealer policy/constraints/identities/functions/other policies, no anonymous or table-wide write grants; complete fixture rollback');
  await testConcurrency(cluster, db, products);
  assert.deepEqual(await rows('SELECT * FROM public.products ORDER BY sku'), products);
  assert.deepEqual(await functions(), original.functions);
  console.log('PASS existing atomic/catalog SQL baseline and post-8A native order concurrency regressions');
} finally { await db?.end(); if (started) await cluster.stop(); }
