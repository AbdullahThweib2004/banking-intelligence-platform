import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { TEST_USERS, isUserConfigured, type TestUser } from './users';
import { ROUTES, type Role } from '../utils/routes';

/**
 * Real Supabase sign-in via the UI login form (no mocked auth state — this
 * app's auth is Supabase `signInWithPassword`, so a mocked session would
 * not exercise the actual login flow this suite is meant to verify).
 *
 * Skips (rather than fails) when the role's env credentials are not set,
 * since no live Supabase test accounts are provisioned by default.
 */
export async function loginAs(page: import('@playwright/test').Page, role: Role): Promise<TestUser> {
  const user = TEST_USERS[role];
  if (!isUserConfigured(role)) {
    base.skip(true, `Skipping: ${user.envPrefix}_EMAIL / ${user.envPrefix}_PASSWORD not set`);
  }
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(user.email as string, user.password as string);
  await expect(page).toHaveURL(new RegExp(ROUTES.dashboard));
  return user;
}

export { expect };
export const test = base;
