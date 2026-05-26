import { defineConfig, devices } from "@playwright/test";

// Read base URL from env so the same config works against a developer's
// running dev server (typical setup: NEXT_PUBLIC_APP_URL=http://localhost:3001).
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3001";

// When SKIP_WEBSERVER=1, assume the dev server is already running (faster
// iteration). When unset, Playwright will spawn `npm run dev` for the suite.
const skipWebServer = process.env.SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/support/**"],
  fullyParallel: false, // tests share seeded data; keep ordering deterministic
  workers: 1,
  reporter: "list",
  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          // Onboarding e2e specs rely on this to short-circuit FireCrawl +
          // Gemini. If you're running your own dev server (SKIP_WEBSERVER=1),
          // start it with `SCRAPE_MOCK_FIXTURES=1 npm run dev`.
          SCRAPE_MOCK_FIXTURES: "1",
        },
      },
});
