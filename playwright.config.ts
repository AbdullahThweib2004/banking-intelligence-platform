import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Load e2e/.env.e2e into process.env before reading it below — without
// this, the file could be filled in correctly and every credentialed test
// would still skip, since nothing else in this project auto-loads it.
// Never overrides a var already set in the environment (e.g. real CI
// secrets), and is a no-op if the file doesn't exist (unconfigured roles
// still skip gracefully, same as before).
if (existsSync('e2e/.env.e2e')) {
  process.loadEnvFile('e2e/.env.e2e');
}

/**
 * Playwright E2E config. baseURL/port defaults match the project's own
 * `npm run dev:web` (vite.config.ts: server.port 8080, strictPort true).
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://localhost:8080',
    // vite.config.ts now serves the dev server over HTTPS with a local
    // mkcert-issued certificate. Playwright launches an isolated Chromium
    // instance that doesn't reliably inherit the OS/NSS trust store
    // `mkcert -install` configured for the regular browser, so without
    // this every navigation would fail on an untrusted-certificate error.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev:web',
    url: process.env.E2E_BASE_URL ?? 'https://localhost:8080',
    reuseExistingServer: !process.env.CI,
    // Separate from use.ignoreHTTPSErrors above — this one governs the
    // internal readiness probe Playwright's test runner makes to `url`
    // before starting tests. Without it, that probe fails Node's own
    // (OS-independent) certificate validation against the mkcert-issued
    // cert, so Playwright never detects the already-running dev server
    // and tries to start a second one on the same port instead.
    ignoreHTTPSErrors: true,
    timeout: 60_000,
  },
});
