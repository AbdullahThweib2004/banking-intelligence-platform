import type { Locator, Page } from '@playwright/test';
import { TEXT } from '../utils/selectors';

/** Page object for src/pages/AuditLog.tsx (risk_department only, despite the "Audit" name). */
export class AuditLogPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly activityLogCard: Locator;
  readonly actionFilter: Locator;
  readonly severityFilter: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: TEXT.auditLog.title, level: 1 });
    this.activityLogCard = page.getByText(TEXT.auditLog.activityLog);
    this.actionFilter = page.getByRole('combobox').first();
    this.severityFilter = page.getByRole('combobox').nth(1);
  }

  async goto() {
    await this.page.goto('/audit-log');
  }
}
