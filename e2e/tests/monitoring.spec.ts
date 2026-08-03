import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { MonitoringPage } from '../pages/MonitoringPage';
import { expectPageNotBlank } from '../utils/helpers';
import { ROLES } from '../utils/routes';

/**
 * src/pages/AuditMonitoring.tsx is the only "monitoring" dashboard in the
 * app (audit_department only) — mapped 1:1 here.
 */
test.describe('Audit Monitoring', () => {
  test('renders the heading and stat cards without crashing', async ({ page }) => {
    await loginAs(page, ROLES.AUDIT);
    const monitoring = new MonitoringPage(page);
    await monitoring.goto();

    await expect(monitoring.heading).toBeVisible();
    await expectPageNotBlank(page);
  });
});
