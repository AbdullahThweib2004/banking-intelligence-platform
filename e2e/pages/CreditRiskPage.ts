import type { Locator, Page } from '@playwright/test';

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
    this.newAssessmentDialogTitle = page.getByRole('dialog').getByText('New Assessment');
    this.applicationsTable = page.getByRole('table');
  }

  async goto() {
    await this.page.goto('/credit-risk');
  }

  async openNewAssessmentDialog() {
    await this.newAssessmentButton.click();
  }
}
