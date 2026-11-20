import { ApiRoutes, HttpStatus } from '../../src/constants/api';
import { ClaimRules, ClaimStatus } from '../../src/constants/claim-rules';
import { ClaimBuilder } from '../../src/data/claim-builder';
import { ClaimResponse, ClaimSummaryResponse } from '../../src/data/claim-types';
import { dateDaysFromToday } from '../../src/data/dates';
import { expect, test } from '../../src/fixtures/ui-fixtures';
import { expectedCurrency, expectedLongDate, expectedShortDate } from '../../src/ui/display-format';
import { MyClaimsText, UiRoutes, WizardText, statusBadgeName } from '../../src/ui/ui-text';

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

test.describe('Submit a claim through the wizard @ui @claims', () => {
  test.beforeEach(async ({ loggedInClaimant, wizardPage }) => {
    expect(loggedInClaimant.url()).toContain(UiRoutes.myClaims);
    await wizardPage.open();
    await expect(wizardPage.step1).toBeVisible();
  });

  test('TC-UI-CLM-001 a claimant submits a claim and sees it in My Claims with the entered values @smoke', async ({
    page,
    wizardPage,
    myClaimsPage,
    claimsApi,
  }) => {
    const builder = ClaimBuilder.aValidClaim();
    const claim = builder.build();

    await wizardPage.submitClaim(claim);

    const successToast = wizardPage.toast(new RegExp(`${WizardText.successToastPrefix} ${UUID_PATTERN}`));
    await expect(successToast).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${UiRoutes.myClaims}$`));

    const row = myClaimsPage.rowWithDescriptionTag(builder.uniqueTag);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(expectedShortDate(claim.incidentDate));
    await expect(row).toContainText(expectedCurrency(claim.claimAmount));
    await expect(row.getByRole('status', { name: statusBadgeName(ClaimStatus.SUBMITTED) })).toBeVisible();

    // The UI must reflect what the backend persisted — cross-check through the API.
    const persisted = (await (await claimsApi.listMine()).json()) as ClaimSummaryResponse[];
    const match = persisted.find((c) => c.description.includes(builder.uniqueTag));
    expect(match, 'claim submitted via UI not found via API').toBeDefined();
    expect(match!.claimAmount).toBe(claim.claimAmount);
    expect(match!.incidentDate).toBe(claim.incidentDate);
    expect(match!.status).toBe(ClaimStatus.SUBMITTED);
  });

  test('TC-UI-CLM-002 the review step shows exactly what was entered before submission', async ({ wizardPage }) => {
    const claim = ClaimBuilder.aValidClaim().build();

    await wizardPage.fillUpToReview(claim);

    await expect(wizardPage.step3).toBeVisible();
    await expect(wizardPage.reviewValue(WizardText.reviewLabels.date)).toHaveText(expectedLongDate(claim.incidentDate));
    await expect(wizardPage.reviewValue(WizardText.reviewLabels.location)).toHaveText(claim.incidentLocation);
    await expect(wizardPage.reviewValue(WizardText.reviewLabels.amount)).toHaveText(expectedCurrency(claim.claimAmount));
    await expect(wizardPage.reviewValue(WizardText.reviewLabels.description)).toHaveText(claim.description);
  });

  test('TC-UI-CLM-003 going back from review keeps every entered value', async ({ wizardPage }) => {
    const claim = ClaimBuilder.aValidClaim().build();
    await wizardPage.fillUpToReview(claim);

    await wizardPage.step3.getByRole('button', { name: WizardText.back }).click();
    await expect(wizardPage.descriptionInput).toHaveValue(claim.description);
    await wizardPage.step2.getByRole('button', { name: WizardText.back }).click();

    await expect(wizardPage.incidentDateInput).toHaveValue(claim.incidentDate);
    await expect(wizardPage.incidentLocationInput).toHaveValue(claim.incidentLocation);
    await expect(wizardPage.claimAmountInput).toHaveValue(String(claim.claimAmount));
  });

  const step1InvalidInputs = [
    { id: 'TC-UI-CLM-010', title: 'a future incident date', override: { incidentDate: dateDaysFromToday(1) }, error: WizardText.errors.futureDate },
    { id: 'TC-UI-CLM-011', title: 'a location below the minimum length', override: { incidentLocation: 'x'.repeat(ClaimRules.incidentLocation.minLength - 1) }, error: WizardText.errors.locationTooShort },
    { id: 'TC-UI-CLM-012', title: 'an amount of zero', override: { claimAmount: 0 }, error: WizardText.errors.amountTooSmall },
    { id: 'TC-UI-CLM-013', title: 'an amount above the maximum', override: { claimAmount: ClaimRules.claimAmount.max + 1 }, error: WizardText.errors.amountTooLarge },
  ];

  for (const input of step1InvalidInputs) {
    test(`${input.id} step 1 blocks ${input.title} with a clear message`, async ({ wizardPage }) => {
      const claim = { ...ClaimBuilder.aValidClaim().build(), ...input.override };

      await wizardPage.fillIncidentDetails(claim);

      await expect(wizardPage.fieldError(input.error)).toBeVisible();
      await expect(wizardPage.step1NextButton).toBeDisabled();
    });
  }

  test('TC-UI-CLM-014 step 2 blocks a description below the minimum length', async ({ wizardPage }) => {
    await wizardPage.completeStep1(ClaimBuilder.aValidClaim().build());

    await wizardPage.descriptionInput.fill('x'.repeat(ClaimRules.description.minLength - 1));

    await expect(wizardPage.fieldError(WizardText.errors.descriptionTooShort)).toBeVisible();
    await expect(wizardPage.step2NextButton).toBeDisabled();
  });

  test('TC-UI-CLM-015 a description of only spaces is reported as a description problem, not a generic failure', async ({
    page,
    wizardPage,
  }) => {
    const claim = ClaimBuilder.aValidClaim().withDescription(' '.repeat(ClaimRules.description.minLength + 1)).build();
    const submitResponse = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith(ApiRoutes.claims.collection),
    );

    await wizardPage.submitClaim(claim);

    expect((await submitResponse).status(), 'server must answer a validation problem with 400').toBe(HttpStatus.BAD_REQUEST);
    await expect(wizardPage.submitError).toContainText(/description/i);
  });

  test('TC-UI-CLM-016 cancelling a started claim asks for confirmation before discarding', async ({
    page,
    wizardPage,
  }) => {
    await wizardPage.fillIncidentDetails(ClaimBuilder.aValidClaim().build());

    await wizardPage.cancelButton.click();

    await expect(page.getByRole('dialog', { name: WizardText.cancelDialog })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${UiRoutes.newClaim}$`));
  });
});

test.describe('My Claims list and detail @ui @claims', () => {
  test('TC-UI-CLM-020 the detail view shows the full persisted claim', async ({
    lifecycle,
    loggedInClaimant,
    myClaimsPage,
  }) => {
    const claim: ClaimResponse = await lifecycle.submit(
      ClaimBuilder.aValidClaim().withDescriptionOfLength(ClaimRules.description.summaryMaxLength + 1),
    );
    await loggedInClaimant.reload();

    const modal = await myClaimsPage.openDetailsFor(claim.claimId);

    await expect(modal.dialog).toBeVisible();
    await expect(modal.valueOf('Claim ID')).toHaveText(claim.claimId);
    await expect(modal.valueOf('Incident Location')).toHaveText(claim.incidentLocation);
    await expect(modal.valueOf('Description'), 'detail must show the untruncated description').toHaveText(claim.description);
    await expect(modal.valueOf('Claim Amount')).toHaveText(expectedCurrency(claim.claimAmount));
    await expect(modal.valueOf('Incident Date')).toHaveText(expectedShortDate(claim.incidentDate));
  });

  test('TC-UI-CLM-021 claims are listed newest first', async ({ lifecycle, loggedInClaimant, myClaimsPage }) => {
    const older = await lifecycle.submit();
    const newer = await lifecycle.submit();
    await loggedInClaimant.reload();

    await expect(myClaimsPage.rowFor(newer.claimId)).toBeVisible();
    const ids = await myClaimsPage.rowIds();
    const shortId = (claimId: string) => claimId.slice(0, MyClaimsText.claimIdPrefixLength);

    expect(ids).toContain(shortId(older.claimId));
    expect(ids.indexOf(shortId(newer.claimId))).toBeLessThan(ids.indexOf(shortId(older.claimId)));
  });

  test('TC-UI-CLM-022 a long description is truncated in the list with an ellipsis', async ({
    lifecycle,
    loggedInClaimant,
    myClaimsPage,
  }) => {
    const builder = ClaimBuilder.aValidClaim().withDescriptionOfLength(ClaimRules.description.maxLength);
    const claim = await lifecycle.submit(builder);
    await loggedInClaimant.reload();

    const descriptionCell = myClaimsPage.rowWithDescriptionTag(builder.uniqueTag).locator('[title]');

    await expect(descriptionCell).toHaveText(
      claim.description.slice(0, MyClaimsText.descriptionMaxChars) + MyClaimsText.ellipsis,
    );
  });
});
