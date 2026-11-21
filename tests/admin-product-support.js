import { expect } from '@playwright/test';
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { login as publicLogin,request,ok } from '../supabase/verification/order_live_support.mjs';
export const state = path => JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
export const baseline = () => state('.verification/8b-before.json').data;
export const admin = () => state('.verification/demo-admin-candidate.json');
export const dealer = () => state('.verification/identity-live-state.json').a;
const manifestPath = '.verification/admin-products-ui-state.json';
export const fixture = () => existsSync(manifestPath) ? state(manifestPath) : {sku:'PDP-TEST-8B-UI'};
export const extraCount = () => (fixture().id ? 1 : 0) + (existsSync('.verification/admin-products-network-fixture.json') ? 1 : 0);
export const remember = record => writeFileSync(manifestPath,JSON.stringify(record,null,2),{mode:0o600});
export const card = (page,id) => page.locator(`#admin-product-grid [data-product-id="${id}"]`);
export const cards = page => page.locator('#admin-product-grid [data-product-id]');
export async function login(page,user,isAdmin=true) {
  await page.goto('/login/');await expect(page.getByRole('button',{name:'Log in',exact:true})).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await expect(page).toHaveURL(isAdmin?/\/admin\/$/:/\/catalog\//);
}
export async function openProducts(page) {
  await login(page,admin());await page.getByRole('link',{name:'Manage products',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/products\//);
  await expect(page.locator('#new-product')).toBeEnabled();
}
export async function fill(page,values) {
  for(const [label,key]of [['SKU','sku'],['Product name','name'],['Unit price (EUR)','unit_price'],['Description (optional)','description']]) {
    if(values[key]!==undefined)await page.getByLabel(label,{exact:true}).fill(String(values[key]));
  }
}
export async function save(page,message='Product saved.') {
  await page.getByRole('button',{name:'Save product',exact:true}).click();
  await expect(page.locator('#products-feedback')).toHaveText(message);
}
export async function status(page,id,action,confirm=true) {
  await card(page,id).getByRole('button',{name:new RegExp(`^${action} `)}).click();
  const dialog=page.locator('#product-confirm');await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element=>{const box=element.getBoundingClientRect();return box.x>=0&&box.right<=innerWidth;})).toBe(true);
  await dialog.getByRole('button',{name:confirm?action:'Cancel',exact:true}).click();
  await expect(dialog).toBeHidden();
  if(confirm)await expect(card(page,id).locator('[data-status]')).toHaveText(action==='Archive'?'Inactive':'Active');
}
export async function restoreProducts(reference) {
  const token=await publicLogin(admin());
  if(reference)ok(await request(`/rest/v1/products?id=eq.${reference.id}`,token,'PATCH',
    Object.fromEntries(['sku','name','description','unit_price','is_active'].map(k=>[k,reference[k]]))));
  if(fixture().id)ok(await request(`/rest/v1/products?id=eq.${fixture().id}`,token,'PATCH',{is_active:false}));
}
