import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { ApprovalsPage } from '../pages/ApprovalsPage';
import { expectPageNotBlank } from '../utils/helpers';
import { ROLES } from '../utils/routes';

test.describe('Approvals (Employee / Manager / Risk)', () => {
  test('branch_employee sees Pending and Processed tabs (no manager gate tab)', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);
    const approvals = new ApprovalsPage(page);
    await approvals.goto();

    await expect(approvals.heading).toBeVisible();
    await expectPageNotBlank(page);
    await expect(approvals.pendingTab).toBeVisible();
    await expect(approvals.processedTab).toBeVisible();
    await expect(approvals.awaitingMyApprovalTab).toHaveCount(0);
  });

  test('branch_manager sees the "Awaiting My Approval" gate tab', async ({ page }) => {
    await loginAs(page, ROLES.MANAGER);
    const approvals = new ApprovalsPage(page);
    await approvals.goto();

    await expect(approvals.awaitingMyApprovalTab).toBeVisible();
  });

  test('table renders with request rows or an explicit empty state', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);
    const approvals = new ApprovalsPage(page);
    await approvals.goto();

    await expect(approvals.table).toBeVisible();
  });

  // TODO: approve/reject action requires a real pending request seeded in
  // the database for the logged-in test account; not exercised here since
  // no live Supabase test data/credentials are provisioned by default.
  test.skip('approves a pending request', async () => {
    // Intentionally not implemented — see comment above.
  });
});
