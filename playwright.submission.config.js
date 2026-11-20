import { defineConfig } from '@playwright/test';
import catalogConfig from './playwright.catalog.config.js';
export default defineConfig({ ...catalogConfig, testMatch: 'submission.spec.js' });
