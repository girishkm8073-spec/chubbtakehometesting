import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';

const CI = Boolean(process.env.CI);
const CI_RETRIES = 1;
const CI_WORKERS = 2;
const TEST_TIMEOUT_MS = 60_000;
const EXPECT_TIMEOUT_MS = 10_000;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? CI_RETRIES : 0,
  workers: CI ? CI_WORKERS : undefined,
  timeout: TEST_TIMEOUT_MS,
  expect: { timeout: EXPECT_TIMEOUT_MS },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'api', testDir: './tests/api' },
    { name: 'contract', testDir: './tests/contract' },
    {
      name: 'ui',
      testDir: './tests/ui',
      use: { ...devices['Desktop Chrome'], baseURL: env.uiBaseUrl },
    },
  ],
});
