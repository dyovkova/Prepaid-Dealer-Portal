import {defineConfig} from '@playwright/test';
import config from './playwright.catalog.config.js';
const live=process.env.PDP_DOCUMENT_UI_NETLIFY==='1';
export default defineConfig({...config,testMatch:'documents.spec.js',maxFailures:1,
  ...(live?{webServer:undefined,use:{...config.use,baseURL:'https://prepaiddealersportal.netlify.app'}}:{})});
