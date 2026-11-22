// LOCAL Storage table/operation stubs only. Never run object DML against Supabase.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { asDealer, fixture } from './order_test_support.mjs';

export async function storageStub(db) {
  await db.query(`CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,bucket_id text REFERENCES storage.buckets(id),name text,
      owner uuid,owner_id text,metadata jsonb,is_delete_marker boolean NOT NULL DEFAULT false,is_versioned boolean NOT NULL DEFAULT false,
      UNIQUE(bucket_id,name));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
    GRANT ALL ON storage.objects,storage.buckets TO anon,authenticated,service_role;
    CREATE FUNCTION storage.allow_any_operation(expected text[]) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT COALESCE(regexp_replace(current_setting('storage.operation',true),'^storage\\.','')=ANY(expected),false) $$;
    CREATE FUNCTION storage.allow_only_operation(expected text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT storage.allow_any_operation(ARRAY[expected]) $$;`);
}
export const operation = (db, name) => db.query("SELECT set_config('storage.operation',$1,false)", [name]);
export async function rejected(db, sql, args = [], code = '42501') {
  await db.query('SAVEPOINT denied_document_operation'); await assert.rejects(db.query(sql, args), { code });
  await db.query('ROLLBACK TO SAVEPOINT denied_document_operation'); await db.query('RELEASE SAVEPOINT denied_document_operation');
}
export const objectInsert = (db, path, actor = fixture.admin, metadata = { mimetype: 'application/pdf', size: 500 }) => db.query(
  "INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES ('order-documents',$1,$2,$3) RETURNING id", [path, actor, metadata]);
export async function publish(db, actor, order, id, name = 'Demo document.pdf', size = 500) {
  await db.query('RESET ROLE'); await db.query('SET ROLE service_role');
  return (await db.query('SELECT public.register_order_document($1,$2,$3,$4,$5) AS id', [actor, order, id, name, size])).rows[0].id;
}
export async function testDocumentStorage(db, a, b, proxyOnly = false) {
  await db.query('BEGIN');
  try {
    const id = randomUUID(), path = `${a}/${id}.pdf`;
    for (const actor of [fixture.a, fixture.b, '']) {
      await asDealer(db, actor); await operation(db, 'object.upload'); await rejected(db, "INSERT INTO storage.objects(bucket_id,name) VALUES ('order-documents',$1)", [path]);
    }
    await db.query('RESET ROLE'); await db.query('SET ROLE anon'); await operation(db, 'object.upload');
    await rejected(db, "INSERT INTO storage.objects(bucket_id,name) VALUES ('order-documents',$1)", [path]);
    await rejected(db, 'SELECT * FROM public.order_documents');
    await asDealer(db, fixture.admin); await operation(db, 'object.upload'); await objectInsert(db, path);
    // Standard Storage authorization probes have MIME/contentLength before final size metadata.
    await db.query('SAVEPOINT upload_permission_probe');
    await objectInsert(db, `${a}/${randomUUID()}.pdf`, fixture.admin, { mimetype: 'application/pdf', contentLength: 500 });
    await db.query('ROLLBACK TO SAVEPOINT upload_permission_probe'); await db.query('RELEASE SAVEPOINT upload_permission_probe');
    for (const bad of [`${a}/../x.pdf`, `${a}/${id}.txt`, `${a}/${id}.pdf/extra`, `${randomUUID()}/${randomUUID()}.pdf`, `${a.toUpperCase()}/${id}.pdf`])
      await rejected(db, "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('order-documents',$1,$2)", [bad, { mimetype: 'application/pdf', size: 500 }]);
    for (const metadata of [{ mimetype: 'text/plain', size: 5 }, { mimetype: 'application/pdf', size: 10485761 }, { mimetype: 'application/pdf', size: 0 }, { mimetype: 'application/pdf', size: '500' }])
      await rejected(db, "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('order-documents',$1,$2)", [`${a}/${randomUUID()}.pdf`, metadata]);
    await rejected(db, "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('order-documents',$1,$2)", [path, { mimetype: 'application/pdf', size: 500 }], '23505');
    await operation(db, 'object.upload_update');
    assert.equal((await db.query("UPDATE storage.objects SET metadata='{}' WHERE name=$1", [path])).rowCount, 0);
    assert.equal((await db.query('DELETE FROM storage.objects WHERE name=$1', [path])).rowCount, 0);
    await operation(db, 'object.sign_upload_url'); await rejected(db, "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('order-documents',$1,$2)", [`${a}/${randomUUID()}.pdf`, { mimetype: 'application/pdf', size: 500 }]);
    console.log('PASS admin upload RLS; anonymous/dealer, wrong order/path/extension/MIME/size, duplicate, overwrite, delete and signed upload denials');

    for (const actor of [fixture.admin, fixture.a, fixture.b]) {
      await asDealer(db, actor);
      for (const op of ['object.get_authenticated', 'object.get_authenticated_info']) {
        await operation(db, op); assert.equal((await db.query('SELECT * FROM storage.objects WHERE name=$1', [path])).rowCount, !proxyOnly && actor === fixture.admin ? 1 : 0);
      }
    }
    for (const actor of [fixture.admin, fixture.a, fixture.b]) {
      await asDealer(db, actor);
      await rejected(db, 'SELECT public.register_order_document($1,$2,$3,$4,500)', [actor, a, id, 'Demo document.pdf']);
      await rejected(db, 'SELECT private.register_order_document($1,$2,$3,$4,500)', [actor, a, id, 'Demo document.pdf']);
    }
    assert.equal(await publish(db, fixture.admin, a, id), id); assert.equal(await publish(db, fixture.admin, a, id), id);
    await rejected(db, 'SELECT public.register_order_document($1,$2,$3,$4,500)', [fixture.admin, a, id, 'Changed.pdf'], 'PT409');
    for (const actor of [fixture.a, fixture.b, randomUUID()]) await rejected(db, 'SELECT public.register_order_document($1,$2,$3,$4,500)', [actor, a, id, 'Demo document.pdf']);
    for (const args of [[fixture.admin, b, id, 'Cross order.pdf', 500], [fixture.admin, a, randomUUID(), 'Missing.pdf', 500], [fixture.admin, a, id, 'Demo.pdf', 501], [fixture.admin, a, id, 'Demo.pdf', 10485761]])
      await rejected(db, 'SELECT public.register_order_document($1,$2,$3,$4,$5)', args, '22023');
    const badId = randomUUID(); await asDealer(db, fixture.admin); await operation(db, 'object.upload'); await objectInsert(db, `${a}/${badId}.pdf`);
    const foreignId = randomUUID(); await objectInsert(db, `${a}/${foreignId}.pdf`, fixture.b);
    await db.query('RESET ROLE'); await db.query('SET ROLE service_role');
    await rejected(db, 'SELECT public.register_order_document($1,$2,$3,$4,500)', [fixture.admin, a, foreignId, 'Foreign owner.pdf'], '22023');
    for (const bad of ['../evil.pdf', 'quote".pdf', 'header\r\ninjection.pdf', '<script>.pdf', 'x.exe', 'test..pdf', 'x'.repeat(121) + '.pdf'])
      await rejected(db, 'SELECT public.register_order_document($1,$2,$3,$4,500)', [fixture.admin, a, badId, bad], '23514');
    console.log('PASS server-only publication, exact replay, conflicting metadata PT409, ownership/order/missing object and safe filename/size constraints');

    await db.query('RESET ROLE'); await db.query('SET ROLE anon');
    for (const op of ['object.get_authenticated', 'object.get_authenticated_info', 'object.list', 'object.get_public', 'object.sign']) {
      await operation(db, op); assert.equal((await db.query('SELECT * FROM storage.objects WHERE name=$1', [path])).rowCount, 0);
    }
    await asDealer(db, randomUUID()); await operation(db, 'object.get_authenticated_info');
    assert.equal((await db.query('SELECT * FROM storage.objects WHERE name=$1', [path])).rowCount, 0);
    // LOCAL stubs: an identical key in another private bucket must never match this policy.
    await db.query('RESET ROLE');
    await db.query("INSERT INTO storage.buckets(id,name,public) VALUES ('unrelated-private','unrelated-private',false)");
    await db.query("INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES ('unrelated-private',$1,$2,$3)", [path, fixture.admin, { mimetype: 'application/pdf', size: 500 }]);
    const own = (await (await asDealer(db, fixture.a), db.query('SELECT * FROM public.order_documents'))).rows;
    assert.equal(own.length, 1); assert.equal(own[0].object_path, path); assert.equal(own[0].uploaded_by, fixture.admin);
    for (const [actor, count] of [[fixture.a, 1], [fixture.b, 0], [fixture.admin, 1]]) {
      await asDealer(db, actor);
      assert.equal((await db.query('SELECT * FROM public.order_documents WHERE id=$1', [id])).rowCount, count);
      // Hosted GET currently emits the legacy info operation, unlike current upstream GET.
      for (const op of ['object.get_authenticated', 'object.get_authenticated_info', 'storage.object.get_authenticated_info', 'object.list', 'object.list_v2']) {
        await operation(db, op);
        const expected = proxyOnly && op.includes('get_authenticated') ? 0 : count;
        assert.equal((await db.query('SELECT * FROM storage.objects WHERE name=$1', [path])).rowCount, expected, `${actor}: ${op}`);
      }
      for (const op of ['object.sign', 'object.sign_many', 'object.get_public', 'object.get_signed', 's3.object.get', '']) { await operation(db, op); assert.equal((await db.query('SELECT * FROM storage.objects WHERE name=$1', [path])).rowCount, 0); }
      await operation(db, 'object.get_authenticated_info');
      assert.equal((await db.query("UPDATE storage.objects SET metadata='{}' WHERE name=$1", [path])).rowCount, 0);
      assert.equal((await db.query('DELETE FROM storage.objects WHERE name=$1', [path])).rowCount, 0);
      for (const sql of ['INSERT INTO public.order_documents DEFAULT VALUES', "UPDATE public.order_documents SET file_name='forged.pdf'", 'DELETE FROM public.order_documents', 'TRUNCATE public.order_documents']) await rejected(db, sql);
    }
    for (const actor of [fixture.a, fixture.admin]) {
      await asDealer(db, actor); await db.query('RESET ROLE'); await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1', [actor]); await db.query('SET ROLE authenticated');
      for (const op of ['object.get_authenticated', 'object.get_authenticated_info']) {
        await operation(db, op); assert.equal((await db.query('SELECT * FROM storage.objects WHERE name=$1', [path])).rowCount, 0);
      }
      assert.equal((await db.query('SELECT * FROM public.order_documents')).rowCount, 0);
      await operation(db, 'object.upload'); await rejected(db, "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('order-documents',$1,$2)", [`${a}/${randomUUID()}.pdf`, { mimetype: 'application/pdf', size: 500 }]);
      if (actor === fixture.admin) { await db.query('RESET ROLE'); await db.query('SET ROLE service_role'); await rejected(db, 'SELECT public.register_order_document($1,$2,$3,$4,500)', [actor, a, id, 'Demo document.pdf']); }
      await db.query('RESET ROLE'); await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1', [actor]);
    }
    await asDealer(db, fixture.a); await db.query('RESET ROLE');
    await db.query('UPDATE public.dealers SET is_active=false WHERE id=(SELECT dealer_id FROM public.orders WHERE id=$1)', [a]); await db.query('SET ROLE authenticated');
    for (const op of ['object.get_authenticated', 'object.get_authenticated_info']) {
      await operation(db, op); assert.equal((await db.query('SELECT * FROM storage.objects WHERE name=$1', [path])).rowCount, 0);
    }
    assert.equal((await db.query('SELECT * FROM public.order_documents')).rowCount, 0);
    await asDealer(db, fixture.admin); assert.equal((await db.query('SELECT * FROM public.order_documents')).rowCount, 1);
    if (proxyOnly) {
      await db.query('RESET ROLE'); await db.query('SET ROLE service_role'); await operation(db, 'object.get_authenticated_info');
      assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='order-documents' AND name=$1", [path])).rowCount, 1);
    }
    console.log('PASS published own-order metadata/list, cross-order isolation, immutable metadata and inactive profile/organization restrictions; no recursive RLS; direct downloads=' + (proxyOnly ? 'denied to every user role, server read only' : 'order-scoped'));
  } finally { await db.query('ROLLBACK'); await db.query('RESET ROLE'); }
}
