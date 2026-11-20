import { Locator, Page } from '@playwright/test';

/** Behaviour shared by every page: navigation and toast lookup. */
export abstract class BasePage {
  protected constructor(protected readonly page: Page) {}

  protected abstract readonly path: string;

  async open(): Promise<void> {
    await this.page.goto(this.path);
  }

  /** react-hot-toast renders toasts as role=status; match by text so concurrent toasts don't collide. */
  toast(text: string | RegExp): Locator {
    return this.page.getByRole('status').filter({ hasText: text });
  }
}
