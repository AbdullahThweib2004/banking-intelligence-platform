import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { NavigationComponent } from '../pages/NavigationComponent';
import { TEXT } from '../utils/selectors';
import { ROUTES, ROLES } from '../utils/routes';

test.describe('Navigation / Sidebar', () => {
  test('branch_employee sees only nav links for its allowed pages', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);
    const nav = new NavigationComponent(page);

    await expect(nav.navLink(TEXT.nav.dashboard)).toBeVisible();
    await expect(nav.navLink(TEXT.nav.creditRisk)).toBeVisible();
    await expect(nav.navLink(TEXT.nav.documents)).toBeVisible();
    await expect(nav.navLink(TEXT.nav.aiAssistant)).toBeVisible();
    await expect(nav.navLink(TEXT.nav.approvals)).toBeVisible();

    // Manager/Risk/Audit-only links must not render for an employee.
    await expect(nav.navLink(TEXT.nav.users)).toHaveCount(0);
    await expect(nav.navLink(TEXT.nav.auditLog)).toHaveCount(0);
    await expect(nav.navLink(TEXT.nav.auditMonitoring)).toHaveCount(0);
    await expect(nav.navLink(TEXT.nav.auditApprovals)).toHaveCount(0);
  });

  test('clicking a nav link navigates to the corresponding page', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);
    const nav = new NavigationComponent(page);

    await nav.goTo(TEXT.nav.creditRisk);
    await expect(page).toHaveURL(new RegExp(ROUTES.creditRisk));
  });

  test('logout returns to the login page', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);
    const nav = new NavigationComponent(page);

    await nav.logout();
    await expect(page).toHaveURL(new RegExp(ROUTES.auth));
  });
});
