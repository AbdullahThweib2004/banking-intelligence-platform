import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { DashboardPage } from '../pages/DashboardPage';
import { expectPageNotBlank } from '../utils/helpers';
import { ROLES } from '../utils/routes';

test.describe('Dashboard', () => {
  test('shows the heading and the four stat cards for an authenticated employee', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);
    const dashboard = new DashboardPage(page);

    await expect(dashboard.heading).toBeVisible();
    await expectPageNotBlank(page);

    await expect(dashboard.totalApplicationsCard).toBeVisible();
    await expect(dashboard.pendingReviewCard).toBeVisible();
    await expect(dashboard.approvedTodayCard).toBeVisible();
    await expect(dashboard.riskScoreCard).toBeVisible();
  });

  for (const role of [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.RISK, ROLES.AUDIT]) {
    test(`dashboard loads for ${role} (on every role's allowed route list)`, async ({ page }) => {
      await loginAs(page, role);
      const dashboard = new DashboardPage(page);
      await expect(dashboard.heading).toBeVisible();
    });
  }
});
