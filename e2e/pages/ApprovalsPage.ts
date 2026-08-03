import type { Locator, Page } from '@playwright/test';
import { TEXT } from '../utils/selectors';

/** Page object for src/pages/Approvals.tsx (Employee/Manager/Risk shared approvals view). */
export class ApprovalsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly awaitingMyApprovalTab: Locator;
  readonly pendingTab: Locator;
  readonly processedTab: Locator;
  readonly table: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: TEXT.approvals.title, level: 1 });
    this.awaitingMyApprovalTab = page.getByRole('tab', { name: /Awaiting My Approval/ });
    this.pendingTab = page.getByRole('tab', { name: /^Pending/ });
    this.processedTab = page.getByRole('tab', { name: /Processed/ });
    this.table = page.getByRole('table');
  }

  async goto() {
    await this.page.goto('/approvals');
  }
}
