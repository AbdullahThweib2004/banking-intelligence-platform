import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { loginAs } from '../fixtures/auth';
import { TEXT } from '../utils/selectors';
import { ROUTES, ROLES } from '../utils/routes';

test.describe('Auth / Login', () => {
  test('renders the login form with email, password, and a login button', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(login.emailInput).toBeVisible();
    await expect(login.passwordInput).toBeVisible();
    await expect(login.loginButton).toBeVisible();
  });

  test('shows a client-side/server error on invalid credentials without navigating away', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.login('not-a-real-user@example.com', 'wrong-password-123');

    await expect(login.errorAlert).toBeVisible();
    await expect(page).toHaveURL(new RegExp(ROUTES.auth));
  });

  test('redirects an already-authenticated user away from /auth to /dashboard', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);

    await page.goto(ROUTES.auth);
    await expect(page).toHaveURL(new RegExp(ROUTES.dashboard));
  });

  test('logs in as branch_employee and reaches the dashboard', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);
    await expect(page.getByRole('heading', { name: TEXT.nav.dashboard, level: 1 })).toBeVisible();
  });
});
