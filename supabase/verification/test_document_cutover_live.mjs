// Future approved rollout only. Retains warmed JWTs in memory across an operator pause.
// Never deploys or purges. No new files/orders; scoped dealer flags restored in finally.
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline/promises';
import { state,login,request,ok,capture,save,query } from './order_live_support.mjs';
import { directDownload,download,unavailable,readable,digest } from './document_live_checks.mjs';
assert.equal(process.env.PDP_DOCUMENT_CUTOVER_LIVE, '1', 'Future approved interactive rollout only');
assert.equal(process.stdin.isTTY, true, 'Use an interactive terminal to keep tokens in memory');
const before=capture(),account=state('.verification/identity-live-state.json').a,admin=state('.verification/demo-admin-candidate.json');
assert.equal(before.history.length,11,'Warm the real direct URL before 012; never simulate an old token with a fresh one');
const document=state('.verification/document-storage-live-state.json').documents[0],tokens={admin:await login(admin),dealer:await login(account)};
for(const token of Object.values(tokens))for(let i=0;i<2;i++)assert.equal((await directDownload(token,document.path)).status,200);
const report={completed:false,purgeAttempted:false,oldDirectJwtTested:true,legacySamples:[],expiry:Object.fromEntries(Object.entries(tokens).map(([role,token])=>[role,new Date(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).exp*1000).toISOString()]))};
console.log('Warmed original direct URL with real admin/dealer JWTs; tokens stay in memory.');
const prompt=createInterface({input:process.stdin,output:process.stdout});
try{await prompt.question('Complete the approved Edge/012 rollout WITHOUT purge or Auth changes, then press Enter. Tokens stay in memory. ');}finally{prompt.close();}
assert.equal(query("SELECT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261122001200') AS ready")[0].ready,true);
async function inspectLegacy(role,phase){
 const response=await directDownload(tokens[role],document.path),cache=response.headers.get('cf-cache-status');
 if(response.status===200){assert.equal(cache,'HIT','An origin bypass is not an accepted historical-cache limitation');assert.equal(digest(response.body),document.sha256);}else unavailable(response);
 report.legacySamples.push({role,phase,status:response.status,cache});
}
for(const role of Object.keys(tokens))await inspectLegacy(role,'after 012');
await readable(tokens.admin,document);await readable(tokens.dealer,document);await readable(tokens.dealer,document);
const activation=active=>request('/rest/v1/rpc/set_dealer_profile_active',tokens.admin,'POST',{p_profile_id:account.id,p_is_active:active});
const organization=active=>request('/rest/v1/dealers?id=eq.'+account.dealerId,tokens.admin,'PATCH',{is_active:active},{Prefer:'return=representation'});
let profileChanged=false,organizationChanged=false,complete=false;
try{
 profileChanged=true;assert.equal(ok(await activation(false)),account.id);
 assert.equal((await download(tokens.dealer,document.path)).status,403);await inspectLegacy('dealer','profile inactive');
 assert.equal(ok(await activation(true)),account.id);profileChanged=false;
 organizationChanged=true;assert.equal(ok(await organization(false))[0].is_active,false);
 assert.equal((await download(tokens.dealer,document.path)).status,403);await inspectLegacy('dealer','organization inactive');await readable(tokens.admin,document);
 assert.equal(ok(await organization(true))[0].is_active,true);organizationChanged=false;complete=true;
}finally{
 if(organizationChanged)assert.equal(ok(await organization(true))[0].is_active,true);
 if(profileChanged)assert.equal(ok(await activation(true)),account.id);
 const after=capture();for(const key of ['auth','profiles','roles','dealers','products','orders','items'])assert.deepEqual(after[key],before[key]);
 save('.verification/document-cutover-report.json',{...report,completed:complete,originalDataPreserved:true,naturalExpiryRechecked:false,at:new Date().toISOString()});
}
console.log(JSON.stringify({...report,completed:complete,naturalExpiryRechecked:false}));
console.log('PASS new checked workflow denies warmed requests after revocation; legacy HIT responses recorded separately without purge; original statuses/data restored.');
