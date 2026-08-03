import type { Locator, Page } from '@playwright/test';
import { TEXT } from '../utils/selectors';

/**
 * Wraps the sidebar/top-bar nav rendered inline in
 * src/components/layout/DashboardLayout.tsx (there is no standalone nav
 * component in the app — this page object models that shared layout).
 */
export class NavigationComponent {
  readonly page: Page;
  readonly userMenuTrigger: Locator;
  readonly logoutMenuItem: Locator;

  constructor(page: Page) {
    this.page = page;
    this.userMenuTrigger = page.getByTestId('user-menu-trigger');
    this.logoutMenuItem = page.getByRole('menuitem', { name: TEXT.nav.logout });
  }

  navLink(name: string): Locator {
    return this.page.getByRole('link', { name });
  }

  async goTo(name: string) {
    await this.navLink(name).click();
  }

  async logout() {
    await this.userMenuTrigger.click();
    await this.logoutMenuItem.click();
  }
}
