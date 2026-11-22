// Explicit opt-in: existing synthetic accounts, one retained empty organization,
// bounded activation checks restored in finally. No users/products/orders created,
// role/membership changes, hard deletion, Auth settings or migration deployment.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { state,save,exists,capture,login,request,ok,denied,query,literal,project } from './order_live_support.mjs';
import { organizations,editOrganization,createOrganization,activateProfile,inspectProfiles,selfAccess,noAdministration,protectedIdentity,businessBlocked,businessRestored } from './admin_dealer_live_checks.mjs';
import { history } from './admin_product_live_checks.mjs';

assert.equal(process.env.PDP_ADMIN_DEALERS_LIVE,'1','Opt in to bounded organization/status verification');
const baselinePath='.verification/admin-dealers-live-before.json',manifestPath='.verification/admin-dealers-live-state.json';
const report={project,passed:[],completed:false};
const reportPath='.verification/admin-dealers-live-report.json';
const pass=message=>{report.passed.push(message);save(reportPath,report);console.log(`PASS ${message}`);};
const accounts=state('.verification/identity-live-state.json'),admin=state('.verification/demo-admin-candidate.json');
const dealers=[accounts.a,accounts.b,state('.verification/auth-ui-fixture.json')];
assert.equal(admin.id,'6c99cda5-d354-496b-ba85-0218fd9ee1af');
const manifest=exists(manifestPath)?state(manifestPath):{name:'Synthetic 9A verification organization',startedAt:new Date().toISOString()};
let before,adminToken,restoreAdmin=false,failure;
function adminActive(active){
  const rows=query(`UPDATE public.profiles p SET is_active=${active}
    FROM auth.users u JOIN public.user_roles r ON r.user_id=u.id WHERE p.id=u.id
    AND u.id=${literal(admin.id)}::uuid AND u.email=${literal(admin.email)} AND r.role='admin'
    AND p.display_name=${literal(before.profiles.find(p=>p.id===admin.id).display_name)} RETURNING p.id`,true);
  assert.equal(rows.length,1,'Only the verified demo admin activation may change');
}
try {
  const current=capture();if(!exists(baselinePath))save(baselinePath,current);before=state(baselinePath);
  assert.equal(before.history.length,7);assert.equal(before.history.at(-1).version,'20261121000700');
  assert.equal(before.roles.filter(r=>r.role==='admin').length,1);
  for(const account of [admin,...dealers]){
    assert.equal(current.auth.find(u=>u.id===account.id)?.email,account.email);
    assert.equal(current.profiles.find(p=>p.id===account.id)?.is_active,true);
    assert.equal(current.roles.find(r=>r.user_id===account.id)?.role,account===admin?'admin':'dealer');
  }
  const originalOrg=before.dealers.find(d=>d.id===accounts.a.dealerId);assert.equal(originalOrg.is_active,true);
  adminToken=await login(admin);const tokens=[];for(const account of dealers)tokens.push(await login(account));
  for(let i=0;i<dealers.length;i++)await selfAccess(tokens[i],dealers[i],before,admin.id);
  assert.deepEqual(ok(await request(`/rest/v1/profiles?id=eq.${accounts.a.id}`,adminToken,'PATCH',
    {display_name:before.profiles.find(p=>p.id===accounts.a.id).display_name},{Prefer:'return=representation'})),[]);
  const all=ok(await organizations(adminToken));
  assert.ok(before.dealers.every(row=>all.some(d=>isDeepStrictEqual(d,row))),'Admin sees all original organizations');
  await inspectProfiles(adminToken,before);
  save(manifestPath,manifest);
  let organization=manifest.id?all.find(d=>d.id===manifest.id):null;
  if(manifest.id)assert.ok(organization,'Recorded organization must still exist');
  else {
    assert.ok(!all.some(d=>d.name===manifest.name),'Stop on an unexpected synthetic name collision');
    organization=ok(await createOrganization(adminToken,{name:manifest.name}))[0];
    manifest.id=organization.id;save(manifestPath,manifest);
  }
  assert.ok(organization.id&&organization.created_at);
  assert.equal(ok(await request(`/rest/v1/profiles?dealer_id=eq.${organization.id}&select=id`,adminToken)).length,0);
  assert.equal(ok(await editOrganization(adminToken,organization.id,{name:'Synthetic 9A verified organization',is_active:false}))[0].is_active,false);
  assert.equal(ok(await editOrganization(adminToken,organization.id,{is_active:true}))[0].is_active,true);
  for(const [values,code]of [[{name:null},'23502'],[{name:'   '},'23514'],[{is_active:null},'23502']]){
    const response=await editOrganization(adminToken,organization.id,values);assert.equal(response.status,400);assert.equal(response.body?.code,code);
  }
  denied(await editOrganization(adminToken,organization.id,{id:organization.id}));
  denied(await createOrganization(adminToken,{id:randomUUID(),name:'Forbidden supplied ID'}));
  denied(await request(`/rest/v1/dealers?id=eq.${organization.id}`,adminToken,'DELETE'));
  pass('Existing demo admin: organization/profile/role reads and joins, empty-org create, name edit, deactivate/reactivate, validation and DELETE/ID protection');

  await protectedIdentity(adminToken,accounts.a.id,organization.id);
  for(const token of tokens){await noAdministration(token,organization.id,accounts.a.id);await protectedIdentity(token,accounts.a.id,organization.id);}
  await noAdministration(null,organization.id,accounts.a.id);
  for(const table of ['dealers','profiles','user_roles'])denied(await request(`/rest/v1/${table}?select=*`,null));
  for(const args of [[null,true],[accounts.a.id,null],[randomUUID(),false],[admin.id,true]]){
    const response=await activateProfile(adminToken,...args);assert.equal(response.status,400);assert.equal(response.body?.code,'22023');
  }
  const hidden=await request('/rest/v1/rpc/set_dealer_profile_active',adminToken,'POST',{p_profile_id:accounts.a.id,p_is_active:true},{'Content-Profile':'private'});
  assert.equal(hidden.status,406);assert.equal(hidden.body?.code,'PGRST106');
  pass('Three dealers/anonymous denied administration; direct profile activation, role/membership/identity writes and DELETE remain prohibited; admin targets/nulls rejected and private implementation unexposed');

  const replay=state('.verification/submission-ui-fixture.json').normal;
  assert.ok(before.orders.some(o=>o.id===replay.orderId&&o.created_by===accounts.a.id&&o.request_id===replay.payload.p_request_id));
  assert.equal(ok(await activateProfile(adminToken,accounts.a.id,false)),accounts.a.id);
  await businessBlocked(tokens[0],replay.payload);await noAdministration(tokens[0],organization.id,accounts.a.id);
  assert.deepEqual(ok(await request('/rest/v1/profiles?select=id,is_active',tokens[0])),[{id:accounts.a.id,is_active:false}]);
  assert.deepEqual(ok(await request('/rest/v1/user_roles?select=user_id,role',tokens[0])),[{user_id:accounts.a.id,role:'dealer'}]);
  assert.equal(ok(await request('/rest/v1/products?select=id',tokens[1])).length,before.products.filter(p=>p.is_active).length);
  assert.equal(ok(await activateProfile(adminToken,accounts.a.id,true)),accounts.a.id);
  await businessRestored(tokens[0],accounts.a,before,replay.payload,replay.orderId);
  pass('Dealer-profile RPC immediately blocks business reads and saved-order replay with the existing JWT; diagnostics/other dealers remain available; restoration recovers access');

  ok(await editOrganization(adminToken,originalOrg.id,{is_active:false}));
  await businessBlocked(tokens[0],replay.payload);await noAdministration(tokens[0],organization.id,accounts.a.id);
  assert.equal(ok(await activateProfile(adminToken,accounts.a.id,true)),accounts.a.id);
  await businessBlocked(tokens[0],replay.payload); // A profile flag cannot bypass inactive organization status.
  assert.equal(ok(await organizations(adminToken)).find(d=>d.id===originalOrg.id).is_active,false);
  ok(await editOrganization(adminToken,originalOrg.id,{is_active:true}));
  await businessRestored(tokens[0],accounts.a,before,replay.payload,replay.orderId);
  pass('Organization deactivation blocks subsequent business requests with unchanged JWT; profile reactivation cannot bypass it; original organization restored');

  restoreAdmin=true;adminActive(false);
  await noAdministration(adminToken,organization.id,accounts.a.id);
  for(const table of ['products','dealers','orders','order_items'])assert.deepEqual(ok(await request(`/rest/v1/${table}?select=*`,adminToken)),[]);
  assert.deepEqual(ok(await request('/rest/v1/profiles?select=id,is_active',adminToken)),[{id:admin.id,is_active:false}]);
  assert.equal(ok(await request('/rest/v1/user_roles?select=user_id',adminToken)).length,1);
  adminActive(true);restoreAdmin=false;await inspectProfiles(adminToken,before);
  for(let i=0;i<dealers.length;i++)await history(tokens[i],before,dealers[i]);
  pass('Inactive admin loses broad reads/CRUD/RPC with the same JWT; guarded trusted profile restoration succeeds; real dealer own/cross-UUID history and saved snapshots remain isolated');
} catch(error){failure=error;}
finally {
  try {
    if(restoreAdmin){adminActive(true);restoreAdmin=false;}
    if(before&&adminToken){
      ok(await activateProfile(adminToken,accounts.a.id,before.profiles.find(p=>p.id===accounts.a.id).is_active));
      ok(await editOrganization(adminToken,accounts.a.dealerId,{is_active:before.dealers.find(d=>d.id===accounts.a.dealerId).is_active}));
      if(manifest.id)ok(await editOrganization(adminToken,manifest.id,{is_active:false}));
    }
  }catch(error){failure??=error;}
}
try {
  if(failure)throw failure;
  const after=capture();
  for(const key of ['auth','profiles','roles','products','orders','items','history','policies'])assert.ok(isDeepStrictEqual(after[key],before[key]),`Preserve ${key}`);
  assert.ok(isDeepStrictEqual(after.dealers.filter(d=>d.id!==manifest.id),before.dealers),'Preserve original organizations');
  assert.equal(after.dealers.length,before.dealers.length+1);
  manifest.retained=after.dealers.find(d=>d.id===manifest.id);assert.equal(manifest.retained.is_active,false);save(manifestPath,manifest);
  pass('All existing users, profiles, roles, memberships, products, orders/items, migrations/security and original organizations preserved; one empty synthetic organization retained inactive');
  report.completed=true;save(reportPath,report);
}catch(error){report.failure=error.message;save(reportPath,report);console.error(`9A verification stopped: ${error.message}`);process.exitCode=1;}
