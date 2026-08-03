import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { CreditRiskPage } from '../pages/CreditRiskPage';
import { expectPageNotBlank } from '../utils/helpers';
import { ROLES } from '../utils/routes';

test.describe('Credit Risk', () => {
  test('renders the heading, applications table, and New Assessment button', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);
    const creditRisk = new CreditRiskPage(page);
    await creditRisk.goto();

    await expect(creditRisk.heading).toBeVisible();
    await expectPageNotBlank(page);
    await expect(creditRisk.newAssessmentButton).toBeVisible();
    await expect(creditRisk.applicationsTable).toBeVisible();
  });

  test('opens the New Assessment dialog', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);
    const creditRisk = new CreditRiskPage(page);
    await creditRisk.goto();

    await creditRisk.openNewAssessmentDialog();
    await expect(creditRisk.newAssessmentDialogTitle).toBeVisible();
  });

  // TODO: a full assessment submission (form fill -> DBR/age-at-maturity
  // rule-engine gate -> saved risk explanation) requires a live Supabase
  // session and real applicant data, and is out of scope for a UI-only,
  // credential-less E2E smoke/interaction pass. Scaffolded here so the
  // reason is explicit rather than silently missing coverage.
  test.skip('submits a new credit assessment end-to-end', async () => {
    // Intentionally not implemented — see comment above.
  });
});
