import { defineConfig } from '@playwright/test';
import catalogConfig from './playwright.catalog.config.js';
const live = process.env.PDP_ADMIN_PRODUCTS_NETLIFY === '1';
export default defineConfig({ ...catalogConfig, testMatch: 'admin-products.spec.js',
  ...(live ? { webServer: undefined, use: { ...catalogConfig.use, baseURL: 'https://prepaiddealersportal.netlify.app' } } : {}),
});
