import { env } from '../../src/config/env';
import { ApiRoutes } from '../../src/constants/api';
import { expect, test } from '../../src/fixtures/ui-fixtures';
import { LoginText, UiRoutes } from '../../src/ui/ui-text';

const UNREGISTERED_PASSWORD_SUFFIX = '-wrong';
const MALFORMED_EMAIL = 'not-an-email';

test.describe('Authentication @ui', () => {
  test('TC-UI-AUTH-001 a claimant logs in and lands on My Claims @smoke', async ({
    page,
    loginPage,
    header,
    claimantCredentials,
  }) => {
    await loginPage.loginAs(claimantCredentials);

    await expect(page).toHaveURL(new RegExp(`${UiRoutes.myClaims}$`));
    await expect(header.myClaimsLink).toBeVisible();
    await expect(header.submitClaimLink).toBeVisible();
    await expect(header.adminClaimsLink).toBeHidden();
  });

  test('TC-UI-AUTH-002 an admin logs in and lands on the admin dashboard', async ({ page, loginPage, header }) => {
    await loginPage.loginAs(env.users.admin);

    await expect(page).toHaveURL(new RegExp(`${UiRoutes.adminDashboard}$`));
    await expect(header.adminClaimsLink).toBeVisible();
    await expect(header.submitClaimLink).toBeHidden();
  });

  test('TC-UI-AUTH-003 a wrong password shows an error and keeps the user on the login page', async ({
    page,
    loginPage,
  }) => {
    await loginPage.loginAs({ ...env.users.claimant, password: env.users.claimant.password + UNREGISTERED_PASSWORD_SUFFIX });

    await expect(loginPage.formError).toHaveText(LoginText.invalidCredentials);
    await expect(page).toHaveURL(new RegExp(`${UiRoutes.login}$`));
  });

  test('TC-UI-AUTH-004 a malformed email is rejected before any request is sent', async ({ page, loginPage }) => {
    let loginRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes(ApiRoutes.auth.login)) loginRequests += 1;
    });

    await loginPage.loginAs({ email: MALFORMED_EMAIL, password: env.users.claimant.password });

    await expect(loginPage.fieldError(LoginText.invalidEmailFormat)).toBeVisible();
    expect(loginRequests).toBe(0);
  });

  test('TC-UI-AUTH-005 an anonymous visitor to My Claims is redirected to login', async ({ page, loginPage }) => {
    await page.goto(UiRoutes.myClaims);

    await expect(page).toHaveURL(new RegExp(`${UiRoutes.login}\\?redirect=`));
    await expect(loginPage.heading).toBeVisible();
  });

  test('TC-UI-AUTH-006 after logout the protected pages are no longer reachable', async ({
    page,
    loggedInClaimant,
    header,
    loginPage,
  }) => {
    await header.logoutButton.click();
    await expect(page).toHaveURL(new RegExp(UiRoutes.login));

    await loggedInClaimant.goto(UiRoutes.myClaims);

    await expect(page, 'session cookies survived logout').toHaveURL(new RegExp(UiRoutes.login));
    await expect(loginPage.heading).toBeVisible();
  });
});
