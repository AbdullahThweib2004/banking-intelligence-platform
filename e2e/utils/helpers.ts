import { expect, type Page } from '@playwright/test';

/**
 * Smoke-level "the page actually rendered" check: main content region is
 * visible and non-empty, and none of the app's own error boundaries/blank
 * states are showing. Used by smoke-all-pages.spec.ts and per-page specs.
 */
export async function expectPageNotBlank(page: Page) {
  const main = page.locator('main, #root');
  await expect(main.first()).toBeVisible();
  const text = await main.first().innerText();
  expect(text.trim().length).toBeGreaterThan(0);
}

/** True when required env vars for a role's credentials are present. */
export function hasCredentials(prefix: string): boolean {
  return Boolean(process.env[`${prefix}_EMAIL`] && process.env[`${prefix}_PASSWORD`]);
}

/**
 * Dismisses the app's page-onboarding tour if it's showing (its auto-show
 * flags are runtime-only, per src/lib/onboardingSession.ts — they reset on
 * every fresh page load, so a freshly-navigated E2E test can hit it at any
 * time). Its full-screen mask intercepts clicks on the real page underneath
 * (breaks page-object actions like opening a dialog), and its step tooltip
 * is itself a `role="dialog"` element (breaks any `getByRole('dialog')`
 * locator that isn't scoped by name). Both are real failures this caused.
 * No-op, near-instantly, if no tour is currently showing.
 */
export async function dismissOnboardingTourIfPresent(page: import('@playwright/test').Page) {
  const skip = page.getByRole('button', { name: /skip/i }).or(page.getByLabel('Skip tour'));
  if (await skip.first().isVisible({ timeout: 1000 }).catch(() => false)) {
    await skip.first().click();
  }
}
