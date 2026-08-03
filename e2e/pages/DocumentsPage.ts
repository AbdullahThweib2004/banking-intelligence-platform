import type { Locator, Page } from '@playwright/test';

/**
 * Page object for src/pages/Documents.tsx. Only the landing/task-card level
 * is covered — the multi-step account-opening wizard requires live
 * backend OCR and real file fixtures, so it is out of scope for stable E2E
 * (see documents.spec.ts TODOs).
 */
export class DocumentsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly openAccountTaskCard: Locator;
  readonly accountWizardDialog: Locator;
  readonly documentsTableCard: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Documents', level: 1 });
    this.openAccountTaskCard = page.getByText('Open New Account');
    this.accountWizardDialog = page.getByRole('dialog');
    this.documentsTableCard = page.getByText('Documents', { exact: true });
  }

  async goto() {
    await this.page.goto('/documents');
  }
}
