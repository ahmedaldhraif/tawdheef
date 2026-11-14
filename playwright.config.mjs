import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The server never opens the user's real .local database during browser checks.
process.env.APPLY_TRACKER_UI_TEST_DATA ||= mkdtempSync(join(tmpdir(), 'apply-tracker-ui-'));
const baseURL = process.env.APPLY_TRACKER_UI_TEST_URL || 'http://127.0.0.1:4017';
const testAddress = new URL(baseURL);
if (testAddress.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(testAddress.hostname) || !testAddress.port) throw new Error('Use a loopback URL with an explicit port for browser tests.');
const browserName = process.env.APPLY_TRACKER_UI_TEST_BROWSER || 'chromium';
if (!['chromium', 'webkit'].includes(browserName)) throw new Error('Use the Chromium or WebKit verification browser.');

export default defineConfig({
  testDir: './tests',
  testMatch: ['marketing-routes-ui.spec.mjs', 'locales-ui.spec.mjs', 'site-appearance-ui.spec.mjs', 'ui.spec.mjs', 'setup-ui.spec.mjs', 'run-filters-ui.spec.mjs', 'progress-ui.spec.mjs', 'snapshot-ui.spec.mjs', 'run-motion-ui.spec.mjs', 'run-polling-ui.spec.mjs', 'agent-monitoring-ui.spec.mjs', 'native-client-ui.spec.mjs'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL,
    browserName,
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
      APPLY_TRACKER_PORT: testAddress.port,
      APPLY_TRACKER_DATA: process.env.APPLY_TRACKER_UI_TEST_DATA,
      APPLY_TRACKER_INSTANCE: 'isolated-browser-tests',
    },
  },
});
