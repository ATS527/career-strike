import { defineConfig, devices } from '@playwright/test';

// E2E runs against the built service (`npm run test:e2e` builds first). No retries: a flaky
// journey must be visible, not hidden.
export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
