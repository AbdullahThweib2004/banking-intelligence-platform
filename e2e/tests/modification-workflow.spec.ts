import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { ModificationRequestsPage } from '../pages/ModificationRequestsPage';
import { expectPageNotBlank } from '../utils/helpers';
import { ROLES } from '../utils/routes';

/**
 * Two-stage modification/objection workflow — UI-level checks.
 *
 * The tests below are read-only: they assert that each role is shown its own
 * workflow stage and, critically, that a role is NEVER offered an action
 * control for a stage it does not own. They create no data.
 *
 * The full write-path journey is defined as a skipped scenario at the bottom
 * with the exact fixture it needs — see the comment there.
 */
test.describe('Modification workflow (two-stage) — per-role UI', () => {
  test('branch_manager sees their own "Pending Manager Review" queue', async ({ page }) => {
    await loginAs(page, ROLES.MANAGER);
    const mods = new ModificationRequestsPage(page);
    await mods.goto();

    await expect(mods.heading).toBeVisible();
    await expectPageNotBlank(page);
    await expect(mods.pendingManagerTab).toBeVisible();
    await expect(mods.processedTab).toBeVisible();
    await expect(mods.table).toBeVisible();
  });

  test('branch_manager also sees a read-only "With Risk Department" queue', async ({ page }) => {
    await loginAs(page, ROLES.MANAGER);
    const mods = new ModificationRequestsPage(page);
    await mods.goto();

    // The manager can watch what has moved on to Risk, but the tab is
    // informational — action controls are asserted per-stage below.
    await expect(mods.withRiskTab).toBeVisible();
  });

  test('risk_department sees their own "Pending Risk Review" queue', async ({ page }) => {
    await loginAs(page, ROLES.RISK);
    const mods = new ModificationRequestsPage(page);
    await mods.goto();

    await expect(mods.heading).toBeVisible();
    await expectPageNotBlank(page);
    await expect(mods.pendingRiskTab).toBeVisible();
    await expect(mods.processedTab).toBeVisible();
  });

  test('risk_department is never offered an action on a manager-pending request', async ({ page }) => {
    await loginAs(page, ROLES.RISK);
    const mods = new ModificationRequestsPage(page);
    await mods.goto();

    // Risk's "other stage" tab is the manager queue. RLS already hides
    // manager-pending rows from risk entirely, so this tab must be empty AND
    // must expose no approve/reject control regardless of what it contains.
    await mods.pendingManagerTab.click();
    await expect(mods.approveButtons).toHaveCount(0);
    await expect(mods.rejectButtons).toHaveCount(0);
  });

  test('branch_employee gets a read-only view with no decision controls', async ({ page }) => {
    await loginAs(page, ROLES.EMPLOYEE);
    const mods = new ModificationRequestsPage(page);
    await mods.goto();

    // Employee reached the page (not redirected to /unauthorized).
    await expect(page).toHaveURL(/\/modification-requests/);
    await expect(mods.heading).toBeVisible();
    await expectPageNotBlank(page);

    // No stage belongs to an employee, so no decision control may render.
    await expect(mods.approveButtons).toHaveCount(0);
    await expect(mods.rejectButtons).toHaveCount(0);
    // They also get no "my queue" tab — only in-review and processed.
    await expect(mods.pendingManagerTab).toHaveCount(0);
  });

  test('audit_department is still redirected away from the page', async ({ page }) => {
    await loginAs(page, ROLES.AUDIT);
    await page.goto('/modification-requests');
    // Existing audit visibility rules are unchanged by this feature.
    await expect(page).toHaveURL(/\/unauthorized/);
  });
});

/**
 * FULL END-TO-END WRITE JOURNEY — intentionally skipped.
 *
 * Steps it would perform:
 *   1. log in as branch_employee
 *   2. submit a modification request from Credit Risk
 *   3. log in as branch_manager
 *   4. approve it
 *   5. assert the "sent to the Risk Department" confirmation
 *   6. log in as risk_department
 *   7. assert it appears in the Risk queue ONLY after the manager approval
 *   8. approve it
 *   9. assert the recalculated rate / installment / score appear
 *  10. assert the final modification + reanalysis status
 *
 * WHY IT IS SKIPPED, precisely:
 *   a) It mutates the live shared Supabase project — it applies a real field
 *      change to a real approval_requests row and triggers a real
 *      re-assessment that overwrites that row's score snapshot. There is no
 *      per-run isolated database, and the change control for this task
 *      forbids modifying live data.
 *   b) It depends on migration 20260829090000_modification_two_stage_workflow.sql
 *      being applied. Until then the submit step fails on the status CHECK
 *      constraint and the decision steps fail on missing RPCs.
 *
 * FIXTURE REQUIRED TO UNSKIP:
 *   - A disposable Supabase project (or a per-run schema) so the write path
 *     is isolated, OR explicit sign-off to mutate the shared project.
 *   - Migration 20260829090000 applied to that target.
 *   - A seeded approval_requests row owned by E2E_EMPLOYEE with a known
 *     `amount`, plus a teardown that deletes both it and the modification
 *     request via the service role (loan_modification_requests has no DELETE
 *     policy for any client role).
 *   - The API-level suite tests/api/modification-workflow.api.spec.ts already
 *     covers every one of the ten steps above at the data layer, including
 *     the stage gating and the applied/not-applied assertions; this UI
 *     scenario would add browser-level coverage of the same guarantees.
 */
test.skip('full journey: employee submits -> manager approves -> risk approves -> assessment recalculated', async () => {
  // Intentionally not implemented — see the block comment above.
});
