import type { Page, Locator } from '@playwright/test';
import { ROUTES } from '../utils/routes';

/**
 * Page object for the two-stage modification/objection workflow screen.
 *
 * The stage tabs are label-driven because the panel renders a different
 * "my queue" label per role — the Branch Manager's own queue is
 * "Pending Manager Review", the Risk Department's own queue is
 * "Pending Risk Review", and each role also sees the other stage's queue as a
 * read-only tab. Asserting on the labels is therefore what actually proves
 * the per-stage separation is rendered correctly.
 */
export class ModificationRequestsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto(ROUTES.modificationRequests);
  }

  /**
   * Scoped to level 1: the page title <h1> and the panel's CardTitle <h3>
   * carry the same text, so an unscoped heading role matches both and trips
   * Playwright's strict mode.
   */
  get heading(): Locator {
    return this.page.getByRole('heading', {
      level: 1,
      name: /Modification Requests|طلبات التعديل/i,
    });
  }

  get table(): Locator {
    return this.page.locator('table').first();
  }

  get rows(): Locator {
    return this.page.getByTestId('modification-request-row');
  }

  tabByName(name: RegExp): Locator {
    return this.page.getByRole('tab', { name });
  }

  get pendingManagerTab(): Locator {
    return this.tabByName(/Pending Manager Review|بانتظار مراجعة المدير/i);
  }

  get pendingRiskTab(): Locator {
    return this.tabByName(/Pending Risk Review|بانتظار مراجعة المخاطر/i);
  }

  get withRiskTab(): Locator {
    return this.tabByName(/With Risk Department|لدى دائرة المخاطر/i);
  }

  get processedTab(): Locator {
    return this.tabByName(/Processed|معالجة/i);
  }

  /** Approve/reject controls only render for the stage that owns the request. */
  get approveButtons(): Locator {
    return this.page.getByTestId('modification-approve');
  }

  get rejectButtons(): Locator {
    return this.page.getByTestId('modification-reject');
  }

  get viewButtons(): Locator {
    return this.page.getByTestId('modification-view');
  }

  get decisionNote(): Locator {
    return this.page.getByTestId('modification-note');
  }

  get confirmDecision(): Locator {
    return this.page.getByTestId('modification-confirm');
  }
}
