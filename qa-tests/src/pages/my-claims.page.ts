import { Locator, Page } from '@playwright/test';
import { ClaimStatusValue } from '../constants/claim-rules';
import { MyClaimsText, UiRoutes, statusBadgeName } from '../ui/ui-text';
import { BasePage } from './base.page';
import { ClaimDetailModal } from './components/claim-detail-modal';

/** Claimant "My Claims" list (/claims). Scoped to the desktop table — the mobile cards duplicate the DOM. */
export class MyClaimsPage extends BasePage {
  protected readonly path = UiRoutes.myClaims;

  readonly heading: Locator;
  readonly submitNewClaimButton: Locator;
  readonly table: Locator;
  readonly detailModal: ClaimDetailModal;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: MyClaimsText.heading, level: 1 });
    this.submitNewClaimButton = page.getByRole('button', { name: MyClaimsText.submitNew });
    this.table = page.getByRole('table');
    this.detailModal = new ClaimDetailModal(page);
  }

  /** The row for a claim, identified by the first characters of its id shown in the table. */
  rowFor(claimId: string): Locator {
    const idPrefix = claimId.slice(0, MyClaimsText.claimIdPrefixLength);
    return this.table.getByRole('row').filter({ has: this.page.locator('code', { hasText: idPrefix }) });
  }

  rowWithDescriptionTag(tag: string): Locator {
    return this.table.getByRole('row').filter({ has: this.page.locator(`[title*="${tag}"]`) });
  }

  statusBadgeIn(row: Locator, status: ClaimStatusValue): Locator {
    return row.getByRole('status', { name: statusBadgeName(status) });
  }

  rowIds(): Promise<string[]> {
    return this.table.locator('tbody code').allInnerTexts();
  }

  async openDetailsFor(claimId: string): Promise<ClaimDetailModal> {
    await this.rowFor(claimId).getByTestId(MyClaimsText.viewDetailsTestId).click();
    return this.detailModal;
  }
}
