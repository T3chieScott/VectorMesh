import { defineConfig, devices } from "@playwright/test";

// Task #182: Playwright config for the committed UI/E2E test that
// exercises the /screens create + regenerate flow against the running
// dev server. The dev server is left running outside of this config
// (workflow "Start application" / `npm run dev`) so the test can
// re-run quickly without re-bootstrapping Express on every run.
//
// Required env: ENABLE_TEST_AUTH_BYPASS=1 (so POST /api/auth/test-login
// is mounted — see server/testAuthRoute.ts).
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [["github"]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5000",
    trace: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
