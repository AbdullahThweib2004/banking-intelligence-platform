import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Load tests/.env.test into process.env before reading it below — see the
// matching comment in playwright.config.ts. Never overrides a var already
// set in the environment; no-op if the file doesn't exist.
if (existsSync('tests/.env.test')) {
  process.loadEnvFile('tests/.env.test');
}

/**
 * Separate config from playwright.config.ts (the UI/E2E suite): these tests
 * use the built-in `request` fixture only (no browser, no webServer) to hit
 * the FastAPI backend and Supabase directly. Point FASTAPI_BASE_URL at a
 * running `npm run dev:api` instance; Supabase tests hit the real project
 * configured via VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY.
 */
export default defineConfig({
  testDir: './tests',
  // These tests hit ONE real, shared Supabase project (not an isolated
  // per-run DB) and several mutate live state (approval_requests,
  // bank_customers, ai_chat_*) through the same handful of real role
  // accounts. Running them in parallel caused a reproducible flaky failure
  // (a role's SELECT immediately after another role's concurrent write
  // occasionally saw a stale result) — confirmed by re-running the exact
  // same test alone, where it passed consistently. Serial execution trades
  // speed for the determinism the suite actually needs against a live
  // external dependency.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report-api' }]],
  use: {
    trace: 'retain-on-failure',
  },
});
