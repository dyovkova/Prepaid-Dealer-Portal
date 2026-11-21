// LOCAL PostgreSQL role/RLS checks only; never pass a hosted connection here.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, asDealer, submit } from './order_test_support.mjs';
import { visible } from './order_read_checks.mjs';

async function denied(db, statement, parameters = [], code = '42501') {
  await db.query('SAVEPOINT rejected_statement');
  await assert.rejects(db.query(statement, parameters), { code });
  await db.query('ROLLBACK TO SAVEPOINT rejected_statement');
  await db.query('RELEASE SAVEPOINT rejected_statement');
}
async function noProductWrites(db, product) {
  await denied(db, "INSERT INTO public.products(sku,name,unit_price) VALUES ('PDP-TEST-8A-DENIED','Denied',1)");
  assert.equal((await db.query('UPDATE public.products SET unit_price=99 WHERE id=$1', [product])).rowCount, 0);
  assert.equal((await db.query('UPDATE public.products SET is_active=false WHERE id=$1', [product])).rowCount, 0);
  await denied(db, 'DELETE FROM public.products WHERE id=$1', [product]);
  await denied(db, 'TRUNCATE public.products');
}
async function validation(db, created) {
  await asDealer(db, fixture.admin);
  for (const [column, value, code] of [
    ['sku', null, '23502'], ['sku', '', '23514'], ['sku', '   ', '23514'],
    ['name', null, '23502'], ['name', '', '23514'], ['name', '   ', '23514'],
    ['unit_price', null, '23502'], ['unit_price', '-0.01', '23514'], ['unit_price', 'NaN', '23514'],
    ['unit_price', 'Infinity', '22003'], ['unit_price', '-Infinity', '22003'], ['unit_price', '10000000000', '22003'],
    ['description', null, '23502'], ['is_active', null, '23502'],
  ]) {
    await denied(db, `UPDATE public.products SET ${column}=$1 WHERE id=$2`, [value, created], code);
    const row = { sku: 'PDP-TEST-8A-VALIDATE', name: 'Synthetic validation', description: '', unit_price: '1.25', is_active: true, [column]: value };
    await denied(db, 'INSERT INTO public.products(sku,name,description,unit_price,is_active) VALUES ($1,$2,$3,$4,$5)',
      [row.sku, row.name, row.description, row.unit_price, row.is_active], code);
  }
  await denied(db, "INSERT INTO public.products(sku,name,unit_price) VALUES ('PDP-TEST-8A-CREATED','Duplicate',1)", [], '23505');
  await denied(db, "UPDATE public.products SET sku='PDP-DEMO-CREDIT-005' WHERE id=$1", [created], '23505');
  for (const price of ['0', '9999999999.99']) {
    assert.equal((await db.query('UPDATE public.products SET unit_price=$1 WHERE id=$2 RETURNING unit_price', [price, created])).rowCount, 1);
  }
  for (const statement of [
    'UPDATE public.products SET id=gen_random_uuid()', 'UPDATE public.products SET created_at=now()',
    "INSERT INTO public.products(id,sku,name,unit_price) VALUES (gen_random_uuid(),'PDP-TEST-8A-ID','Denied',1)",
    "INSERT INTO public.products(created_at,sku,name,unit_price) VALUES (now(),'PDP-TEST-8A-TIME','Denied',1)",
    'DELETE FROM public.products WHERE id=$1',
  ]) await denied(db, statement, statement.includes('$1') ? [created] : []);
  await denied(db, 'TRUNCATE public.products');
  console.log('PASS required fields, blank/duplicate SKU/name, finite/ranged prices and immutable IDs/timestamps; hard delete denied even for an unreferenced product');
}
async function authorization(db, product, products) {
  for (const subject of [fixture.a, fixture.b, randomUUID(), '']) {
    await asDealer(db, subject);
    if ([fixture.a, fixture.b].includes(subject)) {
      await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: subject, user_metadata: { role: 'admin', is_active: true } })]);
      const rows = (await db.query('SELECT * FROM public.products')).rows;
      assert.ok(rows.length > 0 && rows.every(p => p.is_active));
    } else assert.equal((await db.query('SELECT * FROM public.products')).rowCount, 0);
    await noProductWrites(db, product);
  }
  await db.query('RESET ROLE'); await db.query('SET ROLE anon');
  await denied(db, 'SELECT * FROM public.products');
  await denied(db, "INSERT INTO public.products(sku,name,unit_price) VALUES ('PDP-TEST-8A-ANON','Denied',1)");
  await denied(db, 'UPDATE public.products SET is_active=false');
  await denied(db, 'DELETE FROM public.products'); await denied(db, 'TRUNCATE public.products');

  // Keep the same caller claims while trusted LOCAL fixture status changes.
  for (const subject of [fixture.a, fixture.admin]) {
    await asDealer(db, subject); await db.query('RESET ROLE');
    await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1', [subject]);
    await db.query('SET ROLE authenticated');
    assert.equal((await db.query('SELECT * FROM public.products')).rowCount, 0);
    await noProductWrites(db, product);
    await db.query('RESET ROLE');
    await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1', [subject]);
  }
  await asDealer(db); await db.query('RESET ROLE');
  await db.query('UPDATE public.dealers SET is_active=false WHERE id=(SELECT dealer_id FROM public.profiles WHERE id=$1)', [fixture.a]);
  await db.query('SET ROLE authenticated'); assert.equal((await db.query('SELECT * FROM public.products')).rowCount, 0);
  await noProductWrites(db, product);
  await db.query('RESET ROLE');
  await db.query('UPDATE public.dealers SET is_active=true WHERE id=(SELECT dealer_id FROM public.profiles WHERE id=$1)', [fixture.a]);

  await asDealer(db, fixture.admin); await db.query('RESET ROLE');
  await db.query("UPDATE public.user_roles SET role='dealer' WHERE user_id=$1", [fixture.admin]);
  await db.query('SET ROLE authenticated'); await noProductWrites(db, product);
  await db.query('RESET ROLE'); await db.query('DELETE FROM public.user_roles WHERE user_id=$1', [fixture.admin]);
  await db.query('SET ROLE authenticated'); assert.equal((await db.query('SELECT * FROM public.products')).rowCount, 0);
  await noProductWrites(db, product);
  await db.query('RESET ROLE'); await db.query("INSERT INTO public.user_roles(user_id,role) VALUES ($1,'admin')", [fixture.admin]);
  await db.query('SET ROLE authenticated');
  assert.equal((await db.query('SELECT * FROM public.products')).rowCount, products.length + 1);
  // RLS blocks deletion independently of ACLs. Undo this accidental LOCAL grant.
  await db.query('RESET ROLE'); await db.query('SAVEPOINT delete_defense');
  await db.query('GRANT DELETE ON public.products TO authenticated');
  for (const subject of [fixture.a, fixture.admin]) {
    await asDealer(db, subject); assert.equal((await db.query('DELETE FROM public.products WHERE id=$1', [product])).rowCount, 0);
  }
  await db.query('RESET ROLE'); await db.query('ROLLBACK TO SAVEPOINT delete_defense');
  console.log('PASS dealer/anonymous/inactive/missing identity and forged metadata denial; live role removal/demotion; delete RLS defense; no recursive policies');
}
async function snapshots(db, products) {
  const p = products.find(p => p.sku === 'PDP-DEMO-CREDIT-005');
  const key = randomUUID(), lines = [{ product_id: p.id, quantity: 2 }];
  await asDealer(db); const order = await submit(db, key, lines, 'Synthetic 8A snapshot');
  await db.query('RESET ROLE');
  const orders = (await db.query('SELECT * FROM public.orders')).rows;
  const items = (await db.query('SELECT * FROM public.order_items')).rows;
  await asDealer(db, fixture.admin);
  assert.equal((await db.query(`UPDATE public.products SET sku='PDP-TEST-8A-ARCHIVED',
    name='Synthetic edited product',description='Archived by local admin',unit_price=88.99,is_active=false WHERE id=$1 RETURNING id`, [p.id])).rowCount, 1);
  assert.equal((await db.query('SELECT id FROM public.products WHERE id=$1 AND NOT is_active', [p.id])).rowCount, 1);
  await visible(db, [], []); // No admin-wide order access added by 8A.
  await asDealer(db);
  assert.equal((await db.query('SELECT * FROM public.products WHERE id=$1', [p.id])).rowCount, 0);
  assert.equal((await db.query('SELECT * FROM public.products WHERE NOT is_active')).rowCount, 0);
  await visible(db, orders, items);
  const savedItem = items.find(i => i.order_id === order);
  assert.equal(savedItem.sku_snapshot, p.sku); assert.equal(savedItem.name_snapshot, p.name);
  assert.equal(Number(savedItem.unit_price_snapshot), Number(p.unit_price));
  assert.equal(await submit(db, key, lines, 'Synthetic 8A snapshot'), order);
  await denied(db, 'SELECT public.submit_order($1::uuid,$2::jsonb)', [randomUUID(), JSON.stringify(lines)], '22023');
  await asDealer(db, fixture.b); await visible(db, [], []);
  for (const subject of [fixture.a, fixture.b, fixture.admin, '']) {
    await asDealer(db, subject);
    if (!subject) await db.query('SET ROLE anon');
    for (const table of ['orders', 'order_items']) {
      for (const statement of [`INSERT INTO public.${table} DEFAULT VALUES`,
        `UPDATE public.${table} SET ${table === 'orders' ? "status='completed'" : 'quantity=1'}`,
        `DELETE FROM public.${table}`, `TRUNCATE public.${table}`]) await denied(db, statement);
    }
  }
  await db.query('RESET ROLE');
  assert.deepEqual((await db.query('SELECT * FROM public.orders')).rows, orders);
  assert.deepEqual((await db.query('SELECT * FROM public.order_items')).rows, items);
  console.log('PASS admin edit/archive; archived direct UUID hidden from dealers; unchanged saved SKU/name/prices/history and idempotent replay; new archived orders and direct order writes denied');
}
export async function testAdminProducts(db, products) {
  await db.query('BEGIN');
  try {
    await asDealer(db, fixture.admin);
    assert.deepEqual((await db.query('SELECT * FROM public.products ORDER BY sku')).rows, products);
    const { rows: [created] } = await db.query(`INSERT INTO public.products(sku,name,unit_price)
      VALUES ('PDP-TEST-8A-CREATED','Synthetic admin product',1.25) RETURNING *`);
    assert.ok(created.id && created.created_at && created.is_active); assert.equal(created.description, '');
    assert.equal((await db.query('UPDATE public.products SET description=$1,name=$2 WHERE id=$3 RETURNING id', ['Synthetic edit', 'Updated synthetic', created.id])).rowCount, 1);
    await validation(db, created.id);
    await authorization(db, created.id, products);
    await snapshots(db, products);
  } finally { await db.query('ROLLBACK'); await db.query('RESET ROLE'); }
}
