import { expect, test } from '@playwright/test';

const authCookieHeaders = {
  'Set-Cookie': [
    'access_token=mock-access-token; Path=/; HttpOnly; SameSite=Strict',
    'refresh_token=mock-refresh-token; Path=/; HttpOnly; SameSite=Strict',
  ],
};

test.describe('auth smoke flow', () => {
  test('renders the login form and succeeds with valid credentials', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: authCookieHeaders,
        body: JSON.stringify({
          userId: 'user-123',
          email: 'claimant@demo.com',
          name: 'Test Claimant',
          role: 'CLAIMANT',
        }),
      });
    });

    await page.goto('/login');

    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');

    await expect(page.getByRole('heading', { name: /log in/i })).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    await emailInput.fill('claimant@demo.com');
    await passwordInput.fill('Claimant123!');
    await page.getByRole('button', { name: /log in/i }).click();

    await expect(page).toHaveURL(/\/claims$/);
  });

  test('submits a claim successfully after login', async ({ page }) => {
    const today = new Date();
    const incidentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5)
      .toISOString()
      .split('T')[0];

    let claimPostBody: any = null;

    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: authCookieHeaders,
        body: JSON.stringify({
          userId: 'user-123',
          email: 'claimant@demo.com',
          name: 'Test Claimant',
          role: 'CLAIMANT',
        }),
      });
    });

    await page.route('**/api/claims', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
        return;
      }

      claimPostBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          claimId: 'claim-456',
          userId: 'user-123',
          incidentDate,
          incidentLocation: '123 Main Street, Boston',
          description: 'Water damage caused by burst pipe in the kitchen.',
          claimAmount: 2500,
          status: 'SUBMITTED',
          createdAt: '2026-02-17T10:30:00.000Z',
          updatedAt: '2026-02-17T10:30:00.000Z',
        }),
      });
    });

    await page.goto('/login');
    await page.locator('#email').fill('claimant@demo.com');
    await page.locator('#password').fill('Claimant123!');
    await page.getByRole('button', { name: /log in/i }).click();

    // The claims list is fetched from a client-side effect, so its response proves the page
    // has hydrated. The server-rendered button is visible earlier but has no click handler yet,
    // and the "No claims yet" empty state is also server-rendered, so neither is a safe signal.
    const claimsListLoaded = page.waitForResponse(
      (response) => response.url().endsWith('/api/claims') && response.request().method() === 'GET'
    );
    await expect(page).toHaveURL(/\/claims$/);
    await claimsListLoaded;
    await page.getByRole('button', { name: /submit new claim/i }).click();

    await expect(page).toHaveURL(/\/claims\/new$/);
    await page.locator('#incidentDate').fill(incidentDate);
    await page.locator('#incidentLocation').fill('123 Main Street, Boston');
    await page.locator('#claimAmount').fill('2500');
    await page.getByRole('button', { name: /^Next$/i }).click();

    await page.locator('#description').fill('Water damage caused by burst pipe in the kitchen.');
    await page.getByRole('button', { name: /^Next$/i }).click();

    // The header nav also has a "Submit Claim" button, so target the wizard's one in <main>.
    await page.getByRole('main').getByRole('button', { name: /^Submit Claim$/i }).click();

    await expect(page).toHaveURL(/\/claims$/);
    expect(claimPostBody).toMatchObject({
      incidentDate,
      incidentLocation: '123 Main Street, Boston',
      claimAmount: 2500,
      description: 'Water damage caused by burst pipe in the kitchen.',
    });
  });

  test('shows a validation message for invalid credentials', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email or password' }),
      });
    });

    await page.goto('/login');
    await page.locator('#email').fill('wrong@example.com');
    await page.locator('#password').fill('wrong-password');
    await page.getByRole('button', { name: /log in/i }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });
});
