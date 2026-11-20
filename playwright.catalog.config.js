import { defineConfig } from '@playwright/test';
import authConfig from './playwright.config.js';

export default defineConfig({
  ...authConfig,
  testMatch: 'catalog.spec.js',
  timeout: 240000,
  use: { ...authConfig.use, baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    ...authConfig.webServer,
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
  },
});
