import { defineConfig } from '@playwright/test';
import catalogConfig from './playwright.catalog.config.js';
const live = process.env.PDP_ADMIN_ORDERS_NETLIFY === '1';
export default defineConfig({ ...catalogConfig, testMatch: 'admin-orders.spec.js', maxFailures: 1,
  ...(live ? { webServer: undefined, use: { ...catalogConfig.use, baseURL: 'https://prepaiddealersportal.netlify.app' } } : {}),
});
