import type { Locator, Page } from '@playwright/test';

/** Page object for src/pages/AuditApprovals.tsx — Audit's own, separate approvals dashboard. */
export class AuditApprovalsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly awaitingAuditTab: Locator;
  readonly processedTab: Locator;
  readonly table: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Loan Approvals', level: 1 });
    this.awaitingAuditTab = page.getByRole('tab', { name: /Awaiting Audit/ });
    this.processedTab = page.getByRole('tab', { name: /Processed/ });
    this.table = page.getByRole('table');
  }

  async goto() {
    await this.page.goto('/audit-approvals');
  }
}
