import type { Locator, Page } from '@playwright/test';
import { TEXT } from '../utils/selectors';
import { ROUTES } from '../utils/routes';

/** Page object for src/pages/Auth.tsx — locators + actions only. */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel(TEXT.auth.email);
    this.passwordInput = page.getByLabel(TEXT.auth.password);
    this.loginButton = page.getByRole('button', { name: TEXT.auth.login });
    this.errorAlert = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto(ROUTES.auth);
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
