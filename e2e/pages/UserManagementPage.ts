import type { Locator, Page } from '@playwright/test';
import { TEXT } from '../utils/selectors';

/** Page object for src/pages/UserManagement.tsx (branch_manager only). */
export class UserManagementPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly addUserButton: Locator;
  readonly addUserDialogTitle: Locator;
  readonly usersTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: TEXT.users.title, level: 1 });
    this.addUserButton = page.getByRole('button', { name: TEXT.users.addUser });
    this.addUserDialogTitle = page.getByRole('dialog').getByText(TEXT.users.addUser);
    this.usersTable = page.getByRole('table');
  }

  async goto() {
    await this.page.goto('/user-management');
  }

  async openAddUserDialog() {
    await this.addUserButton.click();
  }
}
