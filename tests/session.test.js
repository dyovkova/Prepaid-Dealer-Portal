import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionAuthorization } from '../src/services/session.js';

const user='00000000-0000-4000-8000-00000000aa01';
const result=token=>({data:{session:token?{access_token:token,user:{id:user}}:null},error:null});
test('protected reads wait for session initialization rather than using an API-key fallback',async()=>{
  let release,complete=false;
  const pending=sessionAuthorization(user,{getSession:()=>new Promise(resolve=>{release=resolve;})}).then(h=>{complete=true;return h;});
  await Promise.resolve();assert.equal(complete,false);
  release(result('initialized-token'));assert.equal(await pending,'Bearer initialized-token');
});
test('tokens are read afresh after refresh and are not cached between calls',async()=>{
  let token='first-token';const auth={getSession:async()=>result(token)};
  assert.equal(await sessionAuthorization(user,auth),'Bearer first-token');token='refreshed-token';
  assert.equal(await sessionAuthorization(user,auth),'Bearer refreshed-token');
});
test('missing or changed sessions fail closed before any database request',async()=>{
  let requests=0;
  for(const session of [null,{access_token:'',user:{id:user}},{access_token:'other-token',user:{id:'another-user'}}]) {
    await assert.rejects(async()=>{await sessionAuthorization(user,{getSession:async()=>({data:{session},error:null})});requests++;},
      {code:'portal_session',status:401});
  }
  assert.equal(requests,0);
});
test('SDK session-refresh errors propagate without downgrading to anonymous access',async()=>{
  const error=Object.assign(new Error('refresh failed'),{code:'refresh_failed'});
  await assert.rejects(sessionAuthorization(user,{getSession:async()=>({data:{session:null},error})}),e=>e===error);
});
