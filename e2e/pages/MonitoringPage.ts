import type { Locator, Page } from '@playwright/test';

/**
 * Page object for src/pages/AuditMonitoring.tsx (audit_department only) —
 * the only "monitoring" dashboard in the app, so this maps 1:1 to Audit's
 * monitoring page rather than a separate generic monitoring page.
 */
export class MonitoringPage {
  readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Audit Monitoring', level: 1 });
  }

  async goto() {
    await this.page.goto('/audit-monitoring');
  }
}
