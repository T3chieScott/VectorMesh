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
    // Use the IPv4 loopback explicitly. On this container `localhost`
    // resolves to IPv6 `::1`, but the dev server only binds IPv4, so a
    // `localhost` baseURL intermittently fails with EAFNOSUPPORT ::1.
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5000",
    trace: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // On Replit the Playwright browser bundle isn't downloaded into
        // ~/.cache/ms-playwright; instead the system Chromium is exposed
        // via REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE. Honour it so the
        // tests run both locally (where Playwright manages its own
        // browsers) and inside Replit (where it doesn't).
        launchOptions: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
});
