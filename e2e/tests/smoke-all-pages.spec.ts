import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { expectPageNotBlank } from '../utils/helpers';
import { ROUTES, ROLES, type Role } from '../utils/routes';

/**
 * One smoke test per (page, an allowed role) pair: the page opens, shows a
 * unique heading, is not blank, and does not crash. This is the single
 * file that guarantees every major page is at least reachable for the
 * correct role — deeper interaction assertions live in the per-page specs.
 */
const pages: Array<{ name: string; route: string; role: Role; heading: string }> = [
  { name: 'Dashboard', route: ROUTES.dashboard, role: ROLES.EMPLOYEE, heading: 'Dashboard' },
  { name: 'Credit Risk', route: ROUTES.creditRisk, role: ROLES.EMPLOYEE, heading: 'Credit Risk Assessment' },
  { name: 'Documents', route: ROUTES.documents, role: ROLES.EMPLOYEE, heading: 'Documents' },
  { name: 'AI Assistant', route: ROUTES.aiAssistant, role: ROLES.EMPLOYEE, heading: 'AI Assistant' },
  { name: 'Approvals', route: ROUTES.approvals, role: ROLES.EMPLOYEE, heading: 'Pending Approvals' },
  { name: 'User Management', route: ROUTES.userManagement, role: ROLES.MANAGER, heading: 'User Management' },
  { name: 'Audit Log', route: ROUTES.auditLog, role: ROLES.RISK, heading: 'Audit Log' },
  { name: 'Audit Monitoring', route: ROUTES.auditMonitoring, role: ROLES.AUDIT, heading: 'Audit Monitoring' },
  { name: 'Loan Approvals (Audit)', route: ROUTES.auditApprovals, role: ROLES.AUDIT, heading: 'Loan Approvals' },
];

test.describe('Smoke: every major page opens for the correct role', () => {
  for (const { name, route, role, heading } of pages) {
    test(`${name} opens for ${role} without crashing`, async ({ page }) => {
      await loginAs(page, role);
      await page.goto(route);

      await expect(page).toHaveURL(new RegExp(route));
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      await expectPageNotBlank(page);
    });
  }

  test('login page opens without crashing (unauthenticated)', async ({ page }) => {
    await page.goto(ROUTES.auth);
    await expectPageNotBlank(page);
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });
});
