import { HttpStatus } from '../../src/constants/api';
import { AllowedTransitions, ClaimStatus, ClaimStatusValue, DisputedTransitions } from '../../src/constants/claim-rules';
import { ClaimResponse } from '../../src/data/claim-types';
import { expect, test } from '../../src/fixtures/ui-fixtures';
import { AdminClaimsText, StatusLabel, statusBadgeName } from '../../src/ui/ui-text';

const STATUSES_WITH_TRANSITIONS = (Object.keys(AllowedTransitions) as ClaimStatusValue[]).filter(
  (status) => AllowedTransitions[status].length > 0,
);

test.describe('Admin claims management @ui @claims @admin', () => {
  test.beforeEach(async ({ loggedInAdmin: _signedInAsAdmin, adminClaimsPage }) => {
    await adminClaimsPage.open();
    await expect(adminClaimsPage.heading).toBeVisible();
  });

  test('TC-UI-ADM-001 admin approves a claim under review and the change is persisted @smoke', async ({
    page,
    lifecycle,
    adminClaimsPage,
    claimsApi,
  }) => {
    const claim = await lifecycle.submitInStatus(ClaimStatus.UNDER_REVIEW);
    await page.reload();

    await adminClaimsPage.changeStatus(claim.claimId, ClaimStatus.APPROVED);

    await expect(adminClaimsPage.toast(AdminClaimsText.updatedToast(StatusLabel.APPROVED))).toBeVisible();
    await expect(adminClaimsPage.statusBadgeFor(claim.claimId, ClaimStatus.APPROVED)).toBeVisible();
    const persisted = (await (await claimsApi.getById(claim.claimId)).json()) as ClaimResponse;
    expect(persisted.status).toBe(ClaimStatus.APPROVED);
  });

  test('TC-UI-ADM-002 cancelling the confirmation dialog leaves the claim unchanged', async ({
    page,
    lifecycle,
    adminClaimsPage,
    claimsApi,
  }) => {
    const claim = await lifecycle.submit();
    await page.reload();

    await adminClaimsPage.requestStatusChange(claim.claimId, ClaimStatus.REJECTED);
    await expect(adminClaimsPage.confirmDialog).toContainText(StatusLabel.REJECTED);
    await adminClaimsPage.cancelDialogButton.click();

    await expect(adminClaimsPage.confirmDialog).toBeHidden();
    await expect(adminClaimsPage.statusBadgeFor(claim.claimId, ClaimStatus.SUBMITTED)).toBeVisible();
    const persisted = (await (await claimsApi.getById(claim.claimId)).json()) as ClaimResponse;
    expect(persisted.status).toBe(ClaimStatus.SUBMITTED);
  });

  for (const status of STATUSES_WITH_TRANSITIONS) {
    test(`TC-UI-ADM-003 a ${status} claim offers only its valid next statuses`, async ({
      page,
      lifecycle,
      adminClaimsPage,
    }) => {
      const claim = await lifecycle.submitInStatus(status);
      await page.reload();

      const offered = await adminClaimsPage.offeredStatusLabels(claim.claimId);

      const expectedLabels = AllowedTransitions[status].map((s) => StatusLabel[s]);
      const disputedLabels = DisputedTransitions.filter((t) => t.from === status).map((t) => StatusLabel[t.to]);
      expect(offered).toEqual(expect.arrayContaining(expectedLabels));
      expect(offered.filter((label) => !expectedLabels.includes(label) && !disputedLabels.includes(label))).toEqual([]);
    });
  }

  test('TC-UI-ADM-004 a closed claim offers no further status changes', async ({ page, lifecycle, adminClaimsPage }) => {
    const claim = await lifecycle.submitInStatus(ClaimStatus.CLOSED);
    await page.reload();

    await expect(adminClaimsPage.noTransitionsMarkerFor(claim.claimId)).toBeVisible();
    await expect(adminClaimsPage.statusSelectFor(claim.claimId)).toHaveCount(0);
  });

  test('TC-UI-ADM-005 filtering by status shows only claims in that status', async ({
    page,
    lifecycle,
    adminClaimsPage,
  }) => {
    const rejected = await lifecycle.submitInStatus(ClaimStatus.REJECTED);
    const submitted = await lifecycle.submit();
    await page.reload();
    const filterResponse = page.waitForResponse(
      (response) => response.url().includes(`status=${ClaimStatus.REJECTED}`) && response.status() === HttpStatus.OK,
    );

    await adminClaimsPage.filterByStatus(ClaimStatus.REJECTED);
    await filterResponse;

    await expect(adminClaimsPage.rowFor(rejected.claimId)).toBeVisible();
    await expect(adminClaimsPage.rowFor(submitted.claimId)).toHaveCount(0);
    const badgeNames = await adminClaimsPage.table.getByRole('status').evaluateAll((badges) =>
      badges.map((badge) => badge.getAttribute('aria-label')),
    );
    expect(new Set(badgeNames)).toEqual(new Set([statusBadgeName(ClaimStatus.REJECTED)]));
  });

  test('TC-UI-ADM-006 a failed status change keeps the claims table usable', async ({
    page,
    lifecycle,
    adminClaimsPage,
    adminClaimsApi,
  }) => {
    const claim = await lifecycle.submit();
    await page.reload();
    // Another admin rejects the claim first, so this admin's stale "Under Review" choice is now invalid.
    await adminClaimsApi.updateStatus(claim.claimId, ClaimStatus.REJECTED);
    await adminClaimsApi.updateStatus(claim.claimId, ClaimStatus.CLOSED);

    await adminClaimsPage.changeStatus(claim.claimId, ClaimStatus.UNDER_REVIEW);

    await expect(adminClaimsPage.table, 'one failed update must not hide the whole list').toBeVisible();
    await expect(page.getByText(AdminClaimsText.loadError)).toBeHidden();
  });
});
