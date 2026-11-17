import type { FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig) {
  // No-op setup for now; the app is started by the Playwright webServer config.
}
