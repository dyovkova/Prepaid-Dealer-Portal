import { defineConfig } from '@playwright/test';
import catalogConfig from './playwright.catalog.config.js';

const production = process.env.PDP_SESSION_NETLIFY === '1';

export default defineConfig({
  ...catalogConfig,
  testMatch: 'session.spec.js',
  ...(production ? {
    webServer: undefined,
    use: { ...catalogConfig.use, baseURL: 'https://prepaiddealersportal.netlify.app' },
  } : {}),
});
