import type { Locator, Page } from '@playwright/test';
import { dismissOnboardingTourIfPresent } from '../utils/helpers';

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
    // Scoped by name: src/components/onboarding/OnboardingTour.tsx's own
    // step tooltip is ALSO a role="dialog" element, so an unscoped
    // getByRole('dialog') matches both it and the real wizard dialog.
    this.accountWizardDialog = page.getByRole('dialog', { name: 'Open New Account' });
    this.documentsTableCard = page.getByText('Documents', { exact: true });
  }

  async goto() {
    await this.page.goto('/documents');
    await dismissOnboardingTourIfPresent(this.page);
  }

  /**
   * The onboarding tour can re-target this exact card
   * (data-tour-target="open-new-account" in Documents.tsx) and re-show its
   * mask right as the click happens, even after an earlier dismiss at
   * goto() time — a fresh check immediately before clicking is what
   * actually makes this reliable, not just dismissing once up front.
   */
  async openAccountWizard() {
    await dismissOnboardingTourIfPresent(this.page);
    await this.openAccountTaskCard.click();
  }
}
