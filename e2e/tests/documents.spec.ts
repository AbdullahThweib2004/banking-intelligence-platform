import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { DocumentsPage } from '../pages/DocumentsPage';
import { expectPageNotBlank } from '../utils/helpers';
import { ROLES } from '../utils/routes';

test.describe('Documents', () => {
  test('renders the heading and task cards, including Open New Account', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);
    const documents = new DocumentsPage(page);
    await documents.goto();

    await expect(documents.heading).toBeVisible();
    await expectPageNotBlank(page);
    await expect(documents.openAccountTaskCard).toBeVisible();
  });

  test('opens the account-opening wizard dialog', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);
    const documents = new DocumentsPage(page);
    await documents.goto();

    await documents.openAccountTaskCard.click();
    await expect(documents.accountWizardDialog).toBeVisible();
  });

  // TODO: the multi-step account-opening wizard (ID OCR extraction,
  // employment-proof upload, signature capture) requires a live backend
  // OCR endpoint and real file fixtures to drive meaningfully — out of
  // scope for a UI-only, credential-less E2E pass. Smoke coverage above
  // (page loads, dialog opens) stands in for it per the task's own
  // fallback allowance for workflows that aren't stable enough for deep E2E.
  test.skip('completes the account-opening wizard end-to-end', async () => {
    // Intentionally not implemented — see comment above.
  });
});
