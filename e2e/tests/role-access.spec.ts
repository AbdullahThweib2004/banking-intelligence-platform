import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { ROLES, roleRouteExpectations } from '../utils/routes';

/**
 * Explicit role-based UI access checks: each role can reach its allowed
 * route and is kept off one route it is not allowed on (redirected to
 * /unauthorized, per ProtectedRoute's actual behavior — src/components/ProtectedRoute.tsx).
 */
test.describe('Role-based access', () => {
  for (const role of Object.values(ROLES)) {
    const { allowed, forbidden } = roleRouteExpectations[role];

    test(`${role} can open its allowed route ${allowed}`, async ({ page }) => {
      await loginAs(page, role);
      await page.goto(allowed);
      await expect(page).toHaveURL(new RegExp(allowed));
      await expect(page.getByText(/unauthorized/i)).toHaveCount(0);
    });

    test(`${role} is redirected away from ${forbidden}`, async ({ page }) => {
      await loginAs(page, role);
      await page.goto(forbidden);
      await expect(page).not.toHaveURL(new RegExp(`${forbidden}$`));
      await expect(page).toHaveURL(/unauthorized/);
    });
  }
});
