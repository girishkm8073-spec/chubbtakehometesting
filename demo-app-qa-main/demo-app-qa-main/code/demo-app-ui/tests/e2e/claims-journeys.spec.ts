import { expect, test } from '@playwright/test';
import { AppActions, MockBff, STATUS_LABELS, USERS, daysAgo } from './support/mock-bff';

/**
 * Long end-to-end journeys across roles. The BFF is replaced by an in-memory mock
 * (see support/mock-bff.ts), so each journey controls its own data and failures.
 */

const CLAIMS_PAGE = /\/claims$/;
const ADMIN_DASHBOARD = /\/admin\/dashboard$/;
const ADMIN_CLAIMS = /\/admin\/claims$/;

const VALID_CLAIM = {
  incidentDate: daysAgo(3),
  location: '45 Collins Street, Melbourne',
  amount: '2750.50',
  amountShown: '$2,750.50',
  description: 'Burst water pipe flooded the kitchen and damaged the floorboards.',
};

let mock: MockBff;
let app: AppActions;

test.beforeEach(async ({ page }) => {
  mock = await new MockBff(page).install();
  app = new AppActions(page);
});

test.describe('Claimant journeys', () => {
  test('claimant corrects every validation error, edits on review, submits, sees the claim and logs out', async ({ page }) => {
    const firstLoad = app.waitForApi('GET', '/api/claims');
    await app.loginAs(USERS.claimant, CLAIMS_PAGE);
    await firstLoad;
    await expect(page.getByRole('heading', { name: /no claims yet/i })).toBeVisible();

    await app.main().getByRole('button', { name: /submit new claim/i }).click();
    await expect(page).toHaveURL(/\/claims\/new$/);

    // Step 1: every field invalid first (errors show as you type, Next stays disabled), then corrected.
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await app.fillStep1(tomorrow, 'Rd', '0');
    await expect(page.getByRole('button', { name: /^next$/i })).toBeDisabled();
    await expect(page.getByText('Incident date cannot be in the future')).toBeVisible();
    await expect(page.getByText('Location must be at least 5 characters')).toBeVisible();
    await expect(page.getByText(/claim amount must be at least \$0\.01/i)).toBeVisible();

    await app.fillStep1(VALID_CLAIM.incidentDate, VALID_CLAIM.location, VALID_CLAIM.amount);
    await app.next();

    // Step 2: too short keeps Next disabled; a valid description enables it.
    const description = page.locator('#description');
    await description.fill('Too short');
    await expect(page.getByText('Description must be at least 10 characters')).toBeVisible();
    await expect(page.getByRole('button', { name: /^next$/i })).toBeDisabled();
    await description.fill('Water leak in kitchen.');
    await app.next();

    // Step 3: review, go back to improve the description, return and submit.
    await expect(page.getByRole('heading', { name: /review your claim/i })).toBeVisible();
    await expect(app.main().getByText(VALID_CLAIM.location)).toBeVisible();
    await expect(app.main().getByText(VALID_CLAIM.amountShown)).toBeVisible();
    await page.getByRole('button', { name: /^back$/i }).click();
    await description.fill(VALID_CLAIM.description);
    await app.next();
    await expect(app.main().getByText(VALID_CLAIM.description)).toBeVisible();

    const listReload = app.waitForApi('GET', '/api/claims');
    await app.main().getByRole('button', { name: /^submit claim$/i }).click();
    await expect(page.getByText(/claim submitted successfully/i)).toBeVisible();
    await expect(page).toHaveURL(CLAIMS_PAGE);
    await listReload;

    expect(mock.submittedClaims).toHaveLength(1);
    expect(mock.submittedClaims[0]).toMatchObject({
      incidentDate: VALID_CLAIM.incidentDate,
      incidentLocation: VALID_CLAIM.location,
      claimAmount: Number(VALID_CLAIM.amount),
      description: VALID_CLAIM.description,
    });

    // The new claim is listed with its status, and its details open in a dialog.
    await expect(app.shown(app.main().getByText(VALID_CLAIM.amountShown))).toBeVisible();
    await expect(app.shown(app.main().getByText(STATUS_LABELS.SUBMITTED))).toBeVisible();
    await app.shown(app.main().getByRole('button', { name: /view details/i })).click();
    const details = page.getByRole('dialog', { name: /claim details/i });
    await expect(details).toBeVisible();
    await expect(details.getByText(VALID_CLAIM.location)).toBeVisible();
    await details.getByRole('button', { name: /close/i }).click();
    await expect(details).toBeHidden();

    await page.getByRole('button', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(mock.calls).toContain('POST /api/auth/logout');
  });

  test('claimant who cancels on step 1 after typing is warned that progress will be lost', async ({ page }) => {
    const firstLoad = app.waitForApi('GET', '/api/claims');
    await app.loginAs(USERS.claimant, CLAIMS_PAGE);
    await firstLoad;
    await app.main().getByRole('button', { name: /submit new claim/i }).click();

    await app.fillStep1(VALID_CLAIM.incidentDate, VALID_CLAIM.location, VALID_CLAIM.amount);
    await app.main().getByRole('button', { name: /^cancel$/i }).click();

    await expect(page.getByRole('dialog', { name: /cancel claim submission/i })).toBeVisible();
    await expect(page).toHaveURL(/\/claims\/new$/);
  });

  test('claimant who cancels a half-filled wizard is asked to confirm, can keep editing, then discards', async ({ page }) => {
    const firstLoad = app.waitForApi('GET', '/api/claims');
    await app.loginAs(USERS.claimant, CLAIMS_PAGE);
    await firstLoad;
    await app.main().getByRole('button', { name: /submit new claim/i }).click();

    await app.fillStep1(VALID_CLAIM.incidentDate, VALID_CLAIM.location, VALID_CLAIM.amount);
    await app.next();
    await page.locator('#description').fill(VALID_CLAIM.description);
    await app.main().getByRole('button', { name: /^cancel$/i }).click();

    const confirm = page.getByRole('dialog', { name: /cancel claim submission/i });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: /keep editing/i }).click();
    await expect(confirm).toBeHidden();
    await expect(page.locator('#description')).toHaveValue(VALID_CLAIM.description);

    await app.main().getByRole('button', { name: /^cancel$/i }).click();
    await confirm.getByRole('button', { name: /discard & leave/i }).click();
    await expect(page).toHaveURL(CLAIMS_PAGE);
    expect(mock.submittedClaims).toHaveLength(0);

    // The wizard starts clean next time.
    await app.main().getByRole('button', { name: /submit new claim/i }).click();
    await expect(page.locator('#incidentLocation')).toHaveValue('');
  });

  test('claimant sees the server validation message when the backend rejects the claim, and nothing is saved', async ({ page }) => {
    const firstLoad = app.waitForApi('GET', '/api/claims');
    await app.loginAs(USERS.claimant, CLAIMS_PAGE);
    await firstLoad;
    await app.main().getByRole('button', { name: /submit new claim/i }).click();

    await app.fillStep1(VALID_CLAIM.incidentDate, VALID_CLAIM.location, VALID_CLAIM.amount);
    await app.next();
    await page.locator('#description').fill(VALID_CLAIM.description);
    await app.next();

    const serverMessage = 'Claim amount exceeds the policy limit for this cover';
    mock.failNext('POST', '/api/claims', 400, { status: 400, title: 'Validation Error', detail: serverMessage });
    await app.main().getByRole('button', { name: /^submit claim$/i }).click();

    await expect(app.main().getByText(serverMessage)).toBeVisible();
    await expect(page).toHaveURL(/\/claims\/new$/);
    expect(mock.claims).toHaveLength(0);
  });

  test('claimant session renews silently when the access token expires but the refresh token is valid', async ({ page }) => {
    mock.seedClaim({ incidentLocation: '8 Queen Street, Brisbane' });
    const firstLoad = app.waitForApi('GET', '/api/claims');
    await app.loginAs(USERS.claimant, CLAIMS_PAGE);
    await firstLoad;

    mock.expireSession(true);
    const reload = app.waitForApi('GET', '/api/claims');
    await page.reload();
    await reload;

    await expect(app.shown(app.main().getByText(STATUS_LABELS.SUBMITTED))).toBeVisible();
    await expect(page).toHaveURL(CLAIMS_PAGE);
    expect(mock.calls).toContain('POST /api/auth/refresh');
  });

  test('claimant is sent to login with a session-expired message when the refresh token has also expired', async ({ page }) => {
    const firstLoad = app.waitForApi('GET', '/api/claims');
    await app.loginAs(USERS.claimant, CLAIMS_PAGE);
    await firstLoad;

    mock.expireSession(false);
    await page.reload();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/your session has expired/i)).toBeVisible();
  });

  test('claimant who opens the admin claims page is refused and returned to their own claims', async ({ page }) => {
    const firstLoad = app.waitForApi('GET', '/api/claims');
    await app.loginAs(USERS.claimant, CLAIMS_PAGE);
    await firstLoad;

    await page.goto('/admin/claims');

    await expect(page.getByText(/access denied/i)).toBeVisible();
    await expect(page).toHaveURL(CLAIMS_PAGE);
    expect(mock.statusUpdates).toHaveLength(0);
  });
});

test.describe('Admin journeys', () => {
  test('admin reviews the dashboard, filters claims and walks one claim from Submitted to Closed', async ({ page }) => {
    const claim = mock.seedClaim({ incidentLocation: '3 Ocean Drive, Perth', claimAmount: 9100 });
    mock.seedClaim({ status: 'APPROVED', claimAmount: 1500 });
    mock.seedClaim({ status: 'REJECTED', claimAmount: 300 });

    const statsLoaded = app.waitForApi('GET', '/api/admin/dashboard/stats');
    await app.loginAs(USERS.admin, ADMIN_DASHBOARD);
    await statsLoaded;
    await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible();

    const claimsLoaded = app.waitForApi('GET', '/api/admin/claims');
    await page.getByRole('button', { name: /^claims$/i }).click();
    await expect(page).toHaveURL(ADMIN_CLAIMS);
    await claimsLoaded;
    await expect(page.getByText('3 claims')).toBeVisible();

    // Filter to Submitted only.
    const filtered = app.waitForApi('GET', '/api/admin/claims');
    await page.getByRole('combobox', { name: /filter claims by status/i }).selectOption('SUBMITTED');
    await filtered;
    await expect(page.getByText('1 claims')).toBeVisible();
    expect(mock.calls).toContain('GET /api/admin/claims?status=SUBMITTED');

    await page.getByRole('combobox', { name: /filter claims by status/i }).selectOption('');
    await expect(page.getByText('3 claims')).toBeVisible();

    // Walk the claim through the lifecycle, confirming each step.
    const shortId = claim.claimId.substring(0, 8);
    const statusSelect = app.shown(page.getByTestId(`status-select-${shortId}`));
    for (const next of ['UNDER_REVIEW', 'APPROVED', 'CLOSED'] as const) {
      await statusSelect.selectOption(next);
      const confirm = page.getByRole('dialog', { name: /confirm status change/i });
      await expect(confirm).toContainText(`Change status to ${STATUS_LABELS[next]}?`);
      await confirm.getByRole('button', { name: /^confirm$/i }).click();
      await expect(page.getByText(`Claim status updated to ${STATUS_LABELS[next]}`)).toBeVisible();
    }

    expect(mock.statusUpdates.map((u) => u.newStatus)).toEqual(['UNDER_REVIEW', 'APPROVED', 'CLOSED']);
    expect(mock.claim(claim.claimId).status).toBe('CLOSED');
    // A closed claim offers no further moves.
    await expect(statusSelect).toHaveCount(0);
  });

  test('admin who cancels a status change sends nothing, and a change the backend refuses is rolled back', async ({ page }) => {
    const claim = mock.seedClaim({ status: 'SUBMITTED' });

    const statsLoaded = app.waitForApi('GET', '/api/admin/dashboard/stats');
    await app.loginAs(USERS.admin, ADMIN_DASHBOARD);
    await statsLoaded;
    const claimsLoaded = app.waitForApi('GET', '/api/admin/claims');
    await page.getByRole('button', { name: /^claims$/i }).click();
    await claimsLoaded;

    const shortId = claim.claimId.substring(0, 8);
    const statusSelect = app.shown(page.getByTestId(`status-select-${shortId}`));
    const confirm = page.getByRole('dialog', { name: /confirm status change/i });
    const badge = app.shown(app.main().getByText(STATUS_LABELS.SUBMITTED, { exact: true }));

    // Cancel: nothing is sent, the badge stays.
    await statusSelect.selectOption('REJECTED');
    await confirm.getByRole('button', { name: /^cancel$/i }).click();
    expect(mock.statusUpdates).toHaveLength(0);
    await expect(badge).toBeVisible();

    // Backend refuses: the optimistic badge is rolled back and the reason is shown.
    const refusal = 'Claim is locked by another reviewer';
    mock.failNext('PATCH', `/api/admin/claims/${claim.claimId}/status`, 400, {
      status: 400,
      title: 'Validation Error',
      detail: refusal,
    });
    await statusSelect.selectOption('UNDER_REVIEW');
    await confirm.getByRole('button', { name: /^confirm$/i }).click();

    await expect(page.getByText(refusal).first()).toBeVisible();
    await expect(badge).toBeVisible();
    expect(mock.claim(claim.claimId).status).toBe('SUBMITTED');
  });
});
