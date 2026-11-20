import { Locator, Page } from '@playwright/test';
import { UserCredentials } from '../config/env';
import { LoginText, UiRoutes } from '../ui/ui-text';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  protected readonly path = UiRoutes.login;

  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly formError: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: LoginText.heading, level: 1 });
    this.emailInput = page.getByLabel(LoginText.email);
    // exact: the show/hide toggle is also labelled "... password"
    this.passwordInput = page.getByLabel(LoginText.password, { exact: true });
    this.submitButton = page.getByRole('button', { name: LoginText.submit, exact: true });
    this.formError = page.getByTestId('login-form').getByRole('alert');
  }

  async loginAs(credentials: UserCredentials): Promise<void> {
    await this.open();
    await this.emailInput.fill(credentials.email);
    await this.passwordInput.fill(credentials.password);
    await this.submitButton.click();
  }

  fieldError(message: string): Locator {
    return this.page.getByRole('alert').filter({ hasText: message });
  }
}
