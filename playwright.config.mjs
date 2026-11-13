import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The server never opens the user's real .local database during browser checks.
process.env.APPLY_TRACKER_UI_TEST_DATA ||= mkdtempSync(join(tmpdir(), 'apply-tracker-ui-'));
const baseURL = 'http://127.0.0.1:4017';

export default defineConfig({
  testDir: './tests',
  testMatch: ['ui.spec.mjs', 'setup-ui.spec.mjs', 'run-filters-ui.spec.mjs', 'progress-ui.spec.mjs'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 960 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server/index.mjs',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      APPLY_TRACKER_PORT: '4017',
      APPLY_TRACKER_DATA: process.env.APPLY_TRACKER_UI_TEST_DATA,
      APPLY_TRACKER_INSTANCE: 'isolated-browser-tests',
    },
  },
});
