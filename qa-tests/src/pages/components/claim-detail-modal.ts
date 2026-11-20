import { Locator, Page } from '@playwright/test';
import { ClaimDetailText } from '../../ui/ui-text';

export type ClaimDetailField =
  | 'Claim ID'
  | 'Status'
  | 'Incident Date'
  | 'Incident Location'
  | 'Description'
  | 'Claim Amount'
  | 'Date Submitted'
  | 'Last Updated';

/** Read-only claim detail dialog opened from the claimant list. */
export class ClaimDetailModal {
  readonly dialog: Locator;
  readonly closeButton: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    this.dialog = page.getByRole('dialog', { name: ClaimDetailText.dialogName });
    this.closeButton = this.dialog.getByRole('button', { name: ClaimDetailText.close });
    this.error = this.dialog.getByRole('alert');
  }

  /**
   * Value cell for a label. The modal renders <dt>/<dd> pairs without a <dl>, so the
   * definition-list roles are unavailable; the value is the <dd> immediately after the <dt>.
   */
  valueOf(field: ClaimDetailField): Locator {
    return this.dialog.locator('dt', { hasText: new RegExp(`^${field}$`) }).locator('xpath=following-sibling::dd[1]');
  }
}
