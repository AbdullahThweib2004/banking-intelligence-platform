import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { AuditLogPage } from '../pages/AuditLogPage';
import { expectPageNotBlank } from '../utils/helpers';
import { ROLES } from '../utils/routes';

/** src/pages/AuditLog.tsx is restricted to risk_department only (ROUTE_PERMISSIONS['/audit-log']). */
test.describe('Audit Log (risk_department only)', () => {
  test('renders the heading, activity log, and both filters', async ({ page }) => {
    await loginAs(page, ROLES.RISK);
    const auditLog = new AuditLogPage(page);
    await auditLog.goto();

    await expect(auditLog.heading).toBeVisible();
    await expectPageNotBlank(page);
    await expect(auditLog.activityLogCard).toBeVisible();
    await expect(auditLog.actionFilter).toBeVisible();
    await expect(auditLog.severityFilter).toBeVisible();
  });
});
