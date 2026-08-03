import type { Locator, Page } from '@playwright/test';
import { TEXT } from '../utils/selectors';

/** Page object for src/pages/Dashboard.tsx. */
export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly totalApplicationsCard: Locator;
  readonly pendingReviewCard: Locator;
  readonly approvedTodayCard: Locator;
  readonly riskScoreCard: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: TEXT.nav.dashboard, level: 1 });
    this.totalApplicationsCard = page.getByText(TEXT.dashboard.totalApplications);
    this.pendingReviewCard = page.getByText(TEXT.dashboard.pendingReview);
    this.approvedTodayCard = page.getByText(TEXT.dashboard.approvedToday);
    this.riskScoreCard = page.getByText(TEXT.dashboard.riskScore);
  }

  async goto() {
    await this.page.goto('/dashboard');
  }
}
