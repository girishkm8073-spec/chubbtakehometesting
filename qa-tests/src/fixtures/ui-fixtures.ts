import { Page } from '@playwright/test';
import { env, UserCredentials } from '../config/env';
import { AdminClaimsPage } from '../pages/admin-claims.page';
import { ClaimWizardPage } from '../pages/claim-wizard.page';
import { AppHeader } from '../pages/components/app-header';
import { LoginPage } from '../pages/login.page';
import { MyClaimsPage } from '../pages/my-claims.page';
import { UiRoutes } from '../ui/ui-text';
import { test as apiTest } from './api-fixtures';

type UiFixtures = {
  loginPage: LoginPage;
  header: AppHeader;
  myClaimsPage: MyClaimsPage;
  wizardPage: ClaimWizardPage;
  adminClaimsPage: AdminClaimsPage;
  /** Logs in through the real login form as this worker's dedicated claimant. */
  loggedInClaimant: Page;
  loggedInAdmin: Page;
};

async function loginThroughUi(page: Page, credentials: UserCredentials, landing: string): Promise<Page> {
  await new LoginPage(page).loginAs(credentials);
  await page.waitForURL(`**${landing}`);
  return page;
}

/**
 * UI fixtures extend the API fixtures so a UI test can arrange data through the API
 * (fast, deterministic) and then verify behaviour through the browser.
 * Login goes through the real form: the app keeps auth state in both HttpOnly cookies and
 * localStorage, so injecting cookies alone leaves the header and WebSocket disabled.
 */
export const test = apiTest.extend<UiFixtures>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  header: async ({ page }, use) => use(new AppHeader(page)),
  myClaimsPage: async ({ page }, use) => use(new MyClaimsPage(page)),
  wizardPage: async ({ page }, use) => use(new ClaimWizardPage(page)),
  adminClaimsPage: async ({ page }, use) => use(new AdminClaimsPage(page)),
  loggedInClaimant: async ({ page, claimantCredentials }, use) =>
    use(await loginThroughUi(page, claimantCredentials, UiRoutes.myClaims)),
  loggedInAdmin: async ({ page }, use) => use(await loginThroughUi(page, env.users.admin, UiRoutes.adminDashboard)),
});

export { expect } from '@playwright/test';
