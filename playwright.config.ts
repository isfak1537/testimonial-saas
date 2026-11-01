import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Locally, run against `docker compose up` (reused if already listening).
  // In CI, start the built API, which also serves the built web app.
  webServer: {
    command: "node apps/api/dist/server.js",
    url: `${baseURL}/api/v1/health`,
    // The default limiter (10 sign-ups/log-ins per 15 minutes per IP) would 429 these suites.
    env: {
      AUTH_RATE_LIMIT_MAX: "1000",
      SUBMISSION_RATE_LIMIT_MAX: "1000",
      FORM_RATE_LIMIT_MAX: "1000",
    },
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
