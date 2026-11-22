import { defineConfig } from '@playwright/test';
import config from './playwright.catalog.config.js';

const live = process.env.PDP_VISUAL_LIVE === '1';
export default defineConfig({
  ...config, testMatch: 'visual.spec.js', timeout: 300000, maxFailures: 1,
  ...(live ? { webServer: undefined, use: { ...config.use, baseURL: 'https://prepaiddealersportal.netlify.app' } } : {}),
});
