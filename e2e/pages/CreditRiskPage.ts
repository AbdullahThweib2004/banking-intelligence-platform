import type { Locator, Page } from '@playwright/test';
import { dismissOnboardingTourIfPresent } from '../utils/helpers';

/** Page object for src/pages/CreditRisk.tsx. */
export class CreditRiskPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newAssessmentButton: Locator;
  readonly newAssessmentDialogTitle: Locator;
  readonly applicationsTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Credit Risk Assessment', level: 1 });
    this.newAssessmentButton = page.getByRole('button', { name: 'New Assessment' });
    // Scoped by name, not just getByRole('dialog').getByText(...): the
    // onboarding tour's own step tooltip is ALSO an unnamed role="dialog"
    // element and can show a step titled "New Assessment" for this exact
    // button (data-tour-target="new-assessment" in CreditRisk.tsx) right as
    // it's clicked. The tour tooltip has no aria-label/aria-labelledby, so
    // it has no accessible name and won't match this — only the real
    // Radix dialog (named via its own DialogTitle) will.
    this.newAssessmentDialogTitle = page.getByRole('dialog', { name: 'New Assessment' });
    this.applicationsTable = page.getByRole('table');
  }

  async goto() {
    await this.page.goto('/credit-risk');
    await dismissOnboardingTourIfPresent(this.page);
  }

  async openNewAssessmentDialog() {
    // See DocumentsPage.openAccountWizard() — the tour can re-target this
    // exact button right as it's clicked, even after an earlier dismiss at
    // goto() time, so a fresh check immediately before clicking is what
    // actually makes this reliable.
    await dismissOnboardingTourIfPresent(this.page);
    await this.newAssessmentButton.click();
  }
}
