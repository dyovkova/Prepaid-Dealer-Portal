// Disposable loopback PG17 with LOCAL Storage schema stubs; no hosted writes.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { setupOrderTests, sqlFile, fixture, asDealer, submit } from './order_test_support.mjs';
import { storageStub, testDocumentStorage } from './document_storage_checks.mjs';
const { default: EmbeddedPostgres } = await import(new URL('../../.verification/order-sql-tools/node_modules/embedded-postgres/dist/index.js', import.meta.url));
const root = resolve(import.meta.dirname, '../../.verification'), databaseDir = mkdtempSync(resolve(root, 'documents-pg-')); assert.equal(resolve(databaseDir, '..'), root);
const cluster = new EmbeddedPostgres({ databaseDir, user: 'postgres', password: randomBytes(32).toString('hex'), port: 56441,
  authMethod: 'scram-sha-256', persistent: true, createPostgresUser: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
let db, started = false;
const snapshot = async () => {
  const data = {};
  for (const table of ['dealers', 'profiles', 'user_roles', 'products', 'orders', 'order_items']) data[table] = (await db.query(`SELECT row_to_json(t) AS value FROM public.${table} t ORDER BY row_to_json(t)::text`)).rows;
  return data;
};
try {
  await cluster.initialise(); await cluster.start(); started = true; db = cluster.getPgClient('postgres', '127.0.0.1'); await db.connect(); await db.query("SET statement_timeout='15s'");
  console.log((await db.query('SELECT version()')).rows[0].version);
  const products = await setupOrderTests(db);
  for (const file of ['20261121000500_order_read_access.sql', '20261121000600_admin_product_access.sql', '20261121000700_admin_dealer_access.sql', '20261122000800_admin_order_access.sql', '20261122000900_admin_order_conflict_response.sql']) await db.query(await sqlFile('../migrations/' + file));
  await storageStub(db); await asDealer(db, fixture.a); const a = await submit(db, randomUUID(), [{ product_id: products[0].id, quantity: 2 }]);
  await asDealer(db, fixture.b); const b = await submit(db, randomUUID(), [{ product_id: products[1].id, quantity: 1 }]); await db.query('RESET ROLE');
  const before = await snapshot(); await db.query(await sqlFile('../migrations/20261122001000_order_document_storage.sql')); assert.deepEqual(await snapshot(), before);
  const policies = async () => (await db.query('SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname')).rows;
  const security = async () => (await db.query(`SELECT json_build_object(
    'functions',(SELECT json_agg(json_build_object('oid',oid,'body',prosrc,'acl',proacl,'owner',proowner,'config',proconfig) ORDER BY oid) FROM pg_proc),
    'relations',(SELECT json_agg(json_build_object('oid',oid,'acl',relacl,'rls',relrowsecurity) ORDER BY oid) FROM pg_class),
    'constraints',(SELECT json_agg(json_build_object('oid',oid,'definition',pg_get_constraintdef(oid)) ORDER BY oid) FROM pg_constraint),
    'columns',(SELECT json_agg(json_build_object('rel',attrelid,'number',attnum,'acl',attacl) ORDER BY attrelid,attnum) FROM pg_attribute),
    'bucket',(SELECT json_agg(row_to_json(b)) FROM storage.buckets b),
    'objects',(SELECT count(*) FROM storage.objects),'documents',(SELECT count(*) FROM public.order_documents)) AS state`)).rows[0].state;
  const priorPolicies = await policies(), priorSecurity = await security();
  await db.query(await sqlFile('../migrations/20261122001100_order_document_legacy_read.sql'));
  const correctedPolicies = await policies();
  const affected = correctedPolicies.find(p => p.schemaname === 'storage' && p.policyname === 'order_documents_object_read');
  assert.ok(affected.qual.includes("'object.get_authenticated_info'::text"));
  affected.qual = affected.qual.replace("'object.get_authenticated_info'::text, ", '');
  assert.deepEqual(correctedPolicies, priorPolicies, '011 changes only the legacy operation in the existing SELECT predicate');
  assert.deepEqual(await security(), priorSecurity, '011 preserves all functions, grants, relations, constraints, buckets and stored data');
  assert.deepEqual(await snapshot(), before);
  console.log('PASS 011 changes only one SELECT-policy allowlist entry; all other policy fields, policies, schema, ACLs and stored rows preserved');
  const before012Policies = await policies();
  await db.query(await sqlFile('../migrations/20261122001200_order_document_download_boundary.sql'));
  const after012Policies = await policies(), expected012Policies = structuredClone(before012Policies);
  const readPolicy = expected012Policies.find(p => p.schemaname === 'storage' && p.policyname === 'order_documents_object_read');
  readPolicy.qual = readPolicy.qual.replace("'object.get_authenticated'::text, 'object.get_authenticated_info'::text, ", '');
  assert.deepEqual(after012Policies, expected012Policies, '012 only removes both direct authenticated-download operations');
  assert.deepEqual(await security(), priorSecurity); assert.deepEqual(await snapshot(), before);
  console.log('PASS 012 changes only one SELECT-policy operation list; upload probes, list/pending rules, metadata RLS, grants, functions, data and bucket preserved');
  const bucket = (await db.query("SELECT * FROM storage.buckets WHERE id='order-documents'")).rows[0]; assert.equal(bucket.public, false); assert.equal(Number(bucket.file_size_limit), 10485760); assert.deepEqual(bucket.allowed_mime_types, ['application/pdf']);
  await testDocumentStorage(db, a, b, true); assert.deepEqual(await snapshot(), before);
  assert.equal((await db.query('SELECT * FROM public.order_documents')).rowCount, 0); assert.equal((await db.query('SELECT * FROM storage.objects')).rowCount, 0);
  const acl = (await db.query(`SELECT n.nspname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS client,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
    has_function_privilege('service_role',p.oid,'EXECUTE') AS server FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='register_order_document' ORDER BY n.nspname`)).rows;
  assert.equal(acl.length, 2); for (const f of acl) { assert.equal(f.client, false); assert.equal(f.anon, false); assert.equal(f.server, true); assert.equal(f.owner, 'postgres'); assert.deepEqual(f.proconfig, ['search_path=""']); assert.equal(f.prosecdef, f.nspname === 'private'); }
  console.log('PASS private 10 MiB PDF-only bucket configuration, narrow service-only RPC ACLs, preserved existing rows and full local fixture rollback');
} finally { await db?.end(); if (started) await cluster.stop(); }
