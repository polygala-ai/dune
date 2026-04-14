// Playwright end-to-end configuration.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
});
