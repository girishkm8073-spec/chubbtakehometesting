import { Locator, Page } from '@playwright/test';
import { SubmitClaimRequest } from '../data/claim-types';
import { UiRoutes, WizardText } from '../ui/ui-text';
import { BasePage } from './base.page';

/** Three-step "Submit New Claim" wizard (/claims/new). Each step is a scoped section. */
export class ClaimWizardPage extends BasePage {
  protected readonly path = UiRoutes.newClaim;

  readonly heading: Locator;
  readonly step1: Locator;
  readonly step2: Locator;
  readonly step3: Locator;
  readonly incidentDateInput: Locator;
  readonly incidentLocationInput: Locator;
  readonly claimAmountInput: Locator;
  readonly descriptionInput: Locator;
  readonly step1NextButton: Locator;
  readonly step2NextButton: Locator;
  readonly submitButton: Locator;
  readonly submitError: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: WizardText.heading, level: 1 });
    this.step1 = page.getByTestId(WizardText.step1TestId);
    this.step2 = page.getByTestId(WizardText.step2TestId);
    this.step3 = page.getByTestId(WizardText.step3TestId);
    this.incidentDateInput = this.step1.getByLabel(WizardText.incidentDate);
    this.incidentLocationInput = this.step1.getByLabel(WizardText.incidentLocation);
    this.claimAmountInput = this.step1.getByLabel(WizardText.claimAmount);
    this.descriptionInput = this.step2.getByLabel(WizardText.description);
    this.step1NextButton = this.step1.getByRole('button', { name: WizardText.next });
    this.step2NextButton = this.step2.getByRole('button', { name: WizardText.next });
    // Scoped: the header also has a "Submit Claim" button
    this.submitButton = this.step3.getByRole('button', { name: WizardText.submit });
    this.submitError = this.step3.getByRole('alert');
    this.cancelButton = page.getByRole('button', { name: WizardText.cancel, exact: true });
  }

  async fillIncidentDetails(claim: Pick<SubmitClaimRequest, 'incidentDate' | 'incidentLocation' | 'claimAmount'>) {
    await this.incidentDateInput.fill(claim.incidentDate);
    await this.incidentLocationInput.fill(claim.incidentLocation);
    await this.claimAmountInput.fill(String(claim.claimAmount));
  }

  async completeStep1(claim: SubmitClaimRequest): Promise<void> {
    await this.fillIncidentDetails(claim);
    await this.step1NextButton.click();
  }

  async completeStep2(description: string): Promise<void> {
    await this.descriptionInput.fill(description);
    await this.step2NextButton.click();
  }

  /** Full happy path up to the review step, without submitting. */
  async fillUpToReview(claim: SubmitClaimRequest): Promise<void> {
    await this.completeStep1(claim);
    await this.completeStep2(claim.description);
  }

  async submitClaim(claim: SubmitClaimRequest): Promise<void> {
    await this.fillUpToReview(claim);
    await this.submitButton.click();
  }

  /** Value shown on the review step under an h3 label. */
  reviewValue(label: string): Locator {
    return this.step3
      .getByRole('heading', { level: 3, name: label, exact: true })
      .locator('xpath=following-sibling::*[1]');
  }

  fieldError(message: string): Locator {
    return this.page.getByRole('alert').filter({ hasText: message });
  }
}
