import { Locator, Page } from '@playwright/test';
import { HeaderText, RealtimeText } from '../../ui/ui-text';

/** Navigation header shown on every authenticated page. */
export class AppHeader {
  readonly myClaimsLink: Locator;
  readonly submitClaimLink: Locator;
  readonly adminClaimsLink: Locator;
  readonly logoutButton: Locator;
  readonly liveConnection: Locator;

  constructor(private readonly page: Page) {
    const header = page.getByRole('banner');
    this.myClaimsLink = header.getByRole('button', { name: HeaderText.myClaims, exact: true });
    this.submitClaimLink = header.getByRole('button', { name: HeaderText.submitClaim, exact: true });
    this.adminClaimsLink = header.getByRole('button', { name: HeaderText.adminClaims, exact: true });
    this.logoutButton = header.getByRole('button', { name: HeaderText.logout });
    this.liveConnection = page.getByRole('status', { name: RealtimeText.connectionLive });
  }

  welcomeMessage(name: string): Locator {
    return this.page.getByText(HeaderText.welcome(name));
  }
}
