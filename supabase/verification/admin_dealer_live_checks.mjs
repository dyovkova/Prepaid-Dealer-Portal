// Public Auth/Data API verification helpers. Never log or persist bearer tokens.
import assert from 'node:assert/strict';
import { request,ok,denied,rpc } from './order_live_support.mjs';

const returning={Prefer:'return=representation'};
export const organizations=token=>request('/rest/v1/dealers?select=*&order=id',token);
export const editOrganization=(token,id,values)=>request(`/rest/v1/dealers?id=eq.${id}`,token,'PATCH',values,returning);
export const createOrganization=(token,values)=>request('/rest/v1/dealers',token,'POST',values,returning);
export const activateProfile=(token,id,active)=>request('/rest/v1/rpc/set_dealer_profile_active',token,'POST',{p_profile_id:id,p_is_active:active});
const sorted=rows=>[...rows].sort((a,b)=>String(a.id??a.user_id).localeCompare(String(b.id??b.user_id)));
export async function inspectProfiles(token,before){
  assert.deepEqual(sorted(ok(await request('/rest/v1/profiles?select=*',token))),sorted(before.profiles));
  assert.deepEqual(sorted(ok(await request('/rest/v1/user_roles?select=*',token))),sorted(before.roles));
  const joined=ok(await request('/rest/v1/dealers?select=id,profiles(id,user_roles(role))',token));
  assert.deepEqual(joined.flatMap(d=>d.profiles.map(p=>p.id)).sort(),before.profiles.map(p=>p.id).sort());
}
export async function selfAccess(token,account,before,otherId){
  const profile=before.profiles.find(p=>p.id===account.id),role=before.roles.find(r=>r.user_id===account.id);
  assert.deepEqual(ok(await request('/rest/v1/profiles?select=*',token)),[profile]);
  assert.deepEqual(ok(await request('/rest/v1/user_roles?select=*',token)),[role]);
  assert.deepEqual(ok(await organizations(token)),[before.dealers.find(d=>d.id===account.dealerId)]);
  assert.deepEqual(ok(await request(`/rest/v1/profiles?id=eq.${otherId}&select=*`,token)),[]);
  assert.deepEqual(ok(await request(`/rest/v1/user_roles?user_id=eq.${otherId}&select=*`,token)),[]);
  assert.equal(ok(await request(`/rest/v1/profiles?id=eq.${account.id}`,token,'PATCH',{display_name:profile.display_name},returning)).length,1);
}
export async function noAdministration(token,orgId,profileId){
  denied(await createOrganization(token,{name:'Forbidden synthetic organization'}));
  for(const values of [{name:'Forbidden change'},{is_active:false}]){
    const response=await editOrganization(token,orgId,values);
    if(token)assert.deepEqual(ok(response),[]);else denied(response);
  }
  denied(await request(`/rest/v1/dealers?id=eq.${orgId}`,token,'DELETE'));
  denied(await activateProfile(token,profileId,false));
}
export async function protectedIdentity(token,profileId,orgId){
  for(const values of [{is_active:false},{dealer_id:orgId},{id:profileId}])
    denied(await request(`/rest/v1/profiles?id=eq.${profileId}`,token,'PATCH',values,returning));
  denied(await request(`/rest/v1/user_roles?user_id=eq.${profileId}`,token,'PATCH',{role:'admin'},returning));
  denied(await request(`/rest/v1/profiles?id=eq.${profileId}`,token,'DELETE'));
  denied(await request(`/rest/v1/user_roles?user_id=eq.${profileId}`,token,'DELETE'));
}
export async function businessBlocked(token,replay){
  for(const table of ['products','dealers','orders','order_items'])assert.deepEqual(ok(await request(`/rest/v1/${table}?select=*`,token)),[]);
  // Replaying a recorded request cannot create an extra order if a denial regresses.
  denied(await rpc(token,replay));
}
export async function businessRestored(token,account,before,replay,orderId){
  assert.equal(ok(await request('/rest/v1/products?select=id',token)).length,before.products.filter(p=>p.is_active).length);
  assert.deepEqual(ok(await request('/rest/v1/dealers?select=id',token)),[{id:account.dealerId}]);
  assert.equal(ok(await rpc(token,replay)),orderId);
}
