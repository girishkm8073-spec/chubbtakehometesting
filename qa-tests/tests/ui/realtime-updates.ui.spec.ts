import { Browser } from '@playwright/test';
import { env } from '../../src/config/env';
import { ClaimStatus } from '../../src/constants/claim-rules';
import { expect, test } from '../../src/fixtures/ui-fixtures';
import { AppHeader } from '../../src/pages/components/app-header';
import { LoginPage } from '../../src/pages/login.page';
import { MyClaimsPage } from '../../src/pages/my-claims.page';
import { MyClaimsText, RealtimeText, UiRoutes } from '../../src/ui/ui-text';

/**
 * Integration across every tier: API -> claims-service -> Kafka -> BFF consumer -> WebSocket -> UI.
 * The change is triggered through the API, not the browser being observed, so the only way the
 * screen can change is the real-time push path. Negative "nothing arrived" checks are deliberately
 * not automated: they would pass vacuously whenever the push path is broken.
 */
test.describe('Real-time claim updates @ui @integration @claims', () => {
  test('TC-UI-RT-001 a claimant sees a status change pushed live, without reloading', async ({
    lifecycle,
    loggedInClaimant,
    myClaimsPage,
    header,
    adminClaimsApi,
  }) => {
    const claim = await lifecycle.submit();
    await loggedInClaimant.reload();
    await expect(myClaimsPage.rowFor(claim.claimId)).toBeVisible();
    await expect(header.liveConnection).toBeVisible();

    await adminClaimsApi.updateStatus(claim.claimId, ClaimStatus.UNDER_REVIEW);

    const row = myClaimsPage.rowFor(claim.claimId);
    await expect(myClaimsPage.statusBadgeIn(row, ClaimStatus.UNDER_REVIEW)).toBeVisible({
      timeout: env.realtimeEventTimeoutMs,
    });
    const idPrefix = claim.claimId.slice(0, MyClaimsText.claimIdPrefixLength);
    await expect(myClaimsPage.toast(RealtimeText.claimantStatusToast(idPrefix, ClaimStatus.UNDER_REVIEW))).toBeVisible();
  });

  test('TC-UI-RT-002 an admin is notified live when a claimant submits a new claim', async ({
    browser,
    lifecycle,
  }) => {
    const adminPage = await openAdminDashboard(browser);

    const claim = await lifecycle.submit();

    const idPrefix = claim.claimId.slice(0, MyClaimsText.claimIdPrefixLength);
    await expect(new MyClaimsPage(adminPage).toast(RealtimeText.adminNewClaimToast(idPrefix))).toBeVisible({
      timeout: env.realtimeEventTimeoutMs,
    });
    await adminPage.context().close();
  });
});

async function openAdminDashboard(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await new LoginPage(page).loginAs(env.users.admin);
  await page.waitForURL(`**${UiRoutes.adminDashboard}`);
  await expect(new AppHeader(page).liveConnection).toBeVisible();
  return page;
}
