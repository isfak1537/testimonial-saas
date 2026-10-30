import type { AppOptions } from "../../src/app.js";

/** The one browser origin tests act as; non-GET requests must send it as `Origin` (SEC-02). */
export const TEST_ORIGIN = "http://localhost:3000";

/** Full app config for tests; override only what a test is about. */
export function testConfig(overrides: Partial<AppOptions["config"]> = {}): AppOptions["config"] {
  return {
    WEB_DIST_DIR: "/nonexistent-web",
    WIDGET_DIST_DIR: "/nonexistent-widget",
    APP_ORIGIN: TEST_ORIGIN,
    SESSION_TTL_DAYS: 7,
    // High on purpose: only the rate-limit tests use the real default of 10.
    AUTH_RATE_LIMIT_MAX: 1000,
    SUBMISSION_RATE_LIMIT_MAX: 1000,
    ...overrides,
  };
}
