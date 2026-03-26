import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration.
 * The BASE_URL env var can override the default so CI can point at staging.
 * The server is expected to be running on port 7001 during tests.
 */
export default defineConfig({
  testDir:  './tests',
  timeout:  30_000,
  retries:  1,

  use: {
    baseURL:    process.env['BASE_URL'] ?? 'http://localhost:5173',
    headless:   !!process.env['CI'],   // headed in dev, headless in CI
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
    trace:      'on-first-retry',
  },

  projects: [
    {
      name:   'chromium',
      use:    { ...devices['Desktop Chrome'] },
    },
    {
      name:   'firefox',
      use:    { ...devices['Desktop Firefox'] },
    },
  ],

  /* Uncomment to start the server automatically during `npm test` */
  // webServer: {
  //   command: 'dotnet run --project ../../../server',
  //   port:    7001,
  //   reuseExistingServer: !process.env['CI'],
  // },
});
