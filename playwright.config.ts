import { defineConfig, devices } from '@playwright/test';

const PORT = 3210;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
  // Locally we drive the installed Chrome; CI installs Playwright's Chromium instead.
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], ...(process.env.CI ? {} : { channel: 'chrome' }) } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, ...(process.env.CI ? {} : { channel: 'chrome' }) },
    },
  ],
});
