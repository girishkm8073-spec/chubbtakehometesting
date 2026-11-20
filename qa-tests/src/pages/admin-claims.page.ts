import { Locator, Page } from '@playwright/test';
import { ClaimStatusValue } from '../constants/claim-rules';
import { AdminClaimsText, MyClaimsText, StatusLabel, UiRoutes, statusBadgeName } from '../ui/ui-text';
import { BasePage } from './base.page';

/** Admin "Claims Management" page (/admin/claims). Scoped to the desktop table. */
export class AdminClaimsPage extends BasePage {
  protected readonly path = UiRoutes.adminClaims;

  readonly heading: Locator;
  readonly statusFilter: Locator;
  readonly userIdSearch: Locator;
  readonly table: Locator;
  readonly confirmDialog: Locator;
  readonly confirmButton: Locator;
  readonly cancelDialogButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: AdminClaimsText.heading, level: 1 });
    this.statusFilter = page.getByRole('combobox', { name: AdminClaimsText.statusFilter });
    this.userIdSearch = page.getByRole('textbox', { name: AdminClaimsText.searchUserId });
    this.table = page.getByRole('table');
    this.confirmDialog = page.getByRole('dialog', { name: AdminClaimsText.confirmDialog });
    this.confirmButton = this.confirmDialog.getByRole('button', { name: AdminClaimsText.confirm });
    this.cancelDialogButton = this.confirmDialog.getByRole('button', { name: AdminClaimsText.cancel });
  }

  rowFor(claimId: string): Locator {
    const idPrefix = claimId.slice(0, MyClaimsText.claimIdPrefixLength);
    return this.table.getByRole('row').filter({ has: this.page.locator('code', { hasText: idPrefix }) });
  }

  statusSelectFor(claimId: string): Locator {
    const idPrefix = claimId.slice(0, MyClaimsText.claimIdPrefixLength);
    return this.table.getByTestId(AdminClaimsText.statusSelectTestId(idPrefix));
  }

  statusBadgeFor(claimId: string, status: ClaimStatusValue): Locator {
    return this.rowFor(claimId).getByRole('status', { name: statusBadgeName(status) });
  }

  noTransitionsMarkerFor(claimId: string): Locator {
    return this.rowFor(claimId).getByLabel(AdminClaimsText.noTransitions);
  }

  /** Status options offered for a claim, excluding the disabled placeholder. */
  async offeredStatusLabels(claimId: string): Promise<string[]> {
    return this.statusSelectFor(claimId).locator('option:not([disabled])').allInnerTexts();
  }

  async requestStatusChange(claimId: string, newStatus: ClaimStatusValue): Promise<void> {
    await this.statusSelectFor(claimId).selectOption({ label: StatusLabel[newStatus] });
  }

  async changeStatus(claimId: string, newStatus: ClaimStatusValue): Promise<void> {
    await this.requestStatusChange(claimId, newStatus);
    await this.confirmButton.click();
  }

  async filterByStatus(status: ClaimStatusValue): Promise<void> {
    await this.statusFilter.selectOption({ label: StatusLabel[status] });
  }
}
