import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {createHash} from 'node:crypto';
import {expect} from '@playwright/test';
import {loadEnv} from 'vite';
import {login as apiLogin,request,ok} from '../supabase/verification/order_live_support.mjs';
export const state=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
export const admin=()=>state('.verification/demo-admin-candidate.json');
export const dealer=()=>state('.verification/identity-live-state.json').a;
export const other=()=>state('.verification/identity-live-state.json').b;
export const orderId='1aed83d7-5408-433c-9913-b39d3ae8e09f';
export const stage=()=>process.env.PDP_DOCUMENT_UI_NETLIFY==='1'?'netlify':'preview';
const ledgerPath='.verification/document-ui-state.json';
export const ledger=()=>existsSync(ledgerPath)?state(ledgerPath):{project:'niabpabsvdgxackjjcsb',documents:[]};
export function remember(record){const saved=ledger();const previous=saved.documents.find(d=>d.id===record.id);if(previous)assert.equal(previous.digest,record.digest);else saved.documents.push({...record,stage:stage()});writeFileSync(ledgerPath,JSON.stringify(saved,null,2));}
export const savedDocument=()=>ledger().documents.find(d=>d.stage===stage());
export const recoveryKey=()=>`pdp:document-upload:v1:niabpabsvdgxackjjcsb:${admin().id}:${orderId}`;
export async function pdf(){
 const name=`Synthetic 11B ${stage()} UI.pdf`,path=`.verification/11b-${stage()}-ui.pdf`;
 if(!existsSync(path)){const doc=await PDFDocument.create();doc.addPage().drawText(`Synthetic Milestone 11B ${stage()} UI verification`);writeFileSync(path,await doc.save({useObjectStreams:false}));}
 return{name,mimeType:'application/pdf',buffer:readFileSync(path)};
}
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function login(page,user=admin(),role='admin'){
 await page.goto('/login/');await expect(page.getByRole('button',{name:'Log in',exact:true})).toBeEnabled();
 await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Log in',exact:true}).click();
 await expect(page).toHaveURL(role==='admin'?/\/admin\/$/:/\/catalog\//);
}
export async function details(page,role='admin',id=orderId){
 await page.goto(role==='admin'?`/admin/orders/?id=${id}`:`/order-details/?id=${id}`);
 await expect(page.locator('#order-content')).toBeVisible();await expect(page.locator('#order-documents [data-state]')).not.toContainText('Loading');
}
export async function downloaded(page,name,expectedHash){
 const event=page.waitForEvent('download');await page.getByRole('button',{name:`Download ${name}`,exact:true}).click();const download=await event;
 expect(download.suggestedFilename()).toBe(name);const path=await download.path();expect(hash(readFileSync(path))).toBe(expectedHash);
 await expect(page.locator('#order-documents [data-feedback]')).toContainText('download started');
}
export async function active(value){assert.equal(ok(await request('/rest/v1/rpc/set_dealer_profile_active',await apiLogin(admin()),'POST',{p_profile_id:dealer().id,p_is_active:value})),dealer().id);}
export async function edgeDenied(user,id){const result=await request('/functions/v1/download-order-document',await apiLogin(user),'POST',{documentId:id});assert.ok([403,404].includes(result.status));}
export async function switchTo(page,user){
 const env=loadEnv('production',process.cwd(),'VITE_');const response=ok(await request('/auth/v1/token?grant_type=password',null,'POST',{email:user.email,password:user.password}));
 // Mirror the SDK's supported cross-tab broadcast; JWTs stay in browser Auth storage only.
 await page.evaluate(({session,project})=>{const key=`sb-${project}-auth-token`,oldValue=localStorage.getItem(key),newValue=JSON.stringify({...session,expires_at:Math.floor(Date.now()/1000)+session.expires_in});
  localStorage.setItem(key,newValue);const channel=new BroadcastChannel(key);channel.postMessage({event:'SIGNED_IN',session:JSON.parse(newValue)});setTimeout(()=>channel.close(),200);
 },{session:response,project:new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]});
}
