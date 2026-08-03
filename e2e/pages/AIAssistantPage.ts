import type { Locator, Page } from '@playwright/test';
import { TEXT } from '../utils/selectors';

/**
 * Page object for src/pages/AIAssistant.tsx. The send button is icon-only
 * with no accessible name, so it needed a data-testid (added to the app —
 * see AIAssistant.tsx `data-testid="ai-send-button"` / "ai-chat-input").
 */
export class AIAssistantPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly chatInput: Locator;
  readonly sendButton: Locator;
  readonly sendErrorAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: TEXT.ai.title, level: 1 });
    this.chatInput = page.getByTestId('ai-chat-input');
    this.sendButton = page.getByTestId('ai-send-button');
    this.sendErrorAlert = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/ai-assistant');
  }

  async sendMessage(text: string) {
    await this.chatInput.fill(text);
    await this.sendButton.click();
  }
}
