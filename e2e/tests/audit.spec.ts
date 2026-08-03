import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { AuditApprovalsPage } from '../pages/AuditApprovalsPage';
import { expectPageNotBlank } from '../utils/helpers';
import { ROLES } from '../utils/routes';

test.describe('Audit (audit_department) — Loan Approvals', () => {
  test('Loan Approvals page renders with Awaiting Audit / Processed tabs', async ({ page }) => {
    await loginAs(page, ROLES.AUDIT);
    const auditApprovals = new AuditApprovalsPage(page);
    await auditApprovals.goto();

    await expect(auditApprovals.heading).toBeVisible();
    await expectPageNotBlank(page);
    await expect(auditApprovals.awaitingAuditTab).toBeVisible();
    await expect(auditApprovals.processedTab).toBeVisible();
    await expect(auditApprovals.table).toBeVisible();
  });

  // TODO: final audit approve/reject (with the required decision-note field)
  // requires a request already sitting at pending_audit_approval for the
  // logged-in test account — needs seeded data, not exercised here.
  test.skip('audit-approves a request with a decision note', async () => {
    // Intentionally not implemented — see comment above.
  });
});
