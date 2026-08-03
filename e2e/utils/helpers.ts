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
