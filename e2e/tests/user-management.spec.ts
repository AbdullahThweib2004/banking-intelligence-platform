import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { UserManagementPage } from '../pages/UserManagementPage';
import { expectPageNotBlank } from '../utils/helpers';
import { ROLES } from '../utils/routes';

test.describe('User Management (branch_manager only)', () => {
  test('renders the heading, users table, and Add User button', async ({ page }) => {
    await loginAs(page, ROLES.MANAGER);
    const userManagement = new UserManagementPage(page);
    await userManagement.goto();

    await expect(userManagement.heading).toBeVisible();
    await expectPageNotBlank(page);
    await expect(userManagement.addUserButton).toBeVisible();
    await expect(userManagement.usersTable).toBeVisible();
  });

  test('opens the Add User dialog', async ({ page }) => {
    await loginAs(page, ROLES.MANAGER);
    const userManagement = new UserManagementPage(page);
    await userManagement.goto();

    await userManagement.openAddUserDialog();
    await expect(userManagement.addUserDialogTitle).toBeVisible();
  });

  // TODO: creating a real user requires a live Supabase admin call and
  // would leave test data behind; not exercised here without a dedicated
  // seeding/teardown strategy.
  test.skip('creates a new user', async () => {
    // Intentionally not implemented — see comment above.
  });
});
