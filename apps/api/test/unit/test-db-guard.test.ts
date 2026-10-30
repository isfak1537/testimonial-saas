import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabaseUrl } from "../helpers/test-db.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("testDatabaseUrl guard", () => {
  it("accepts the local test database from .env.example", () => {
    const url = "postgresql://testimonial:testimonial_test@localhost:54330/testimonial_test";
    vi.stubEnv("TEST_DATABASE_URL", url);
    expect(testDatabaseUrl()).toBe(url);
  });

  it("accepts the built-in default when the variable is unset", () => {
    vi.stubEnv("TEST_DATABASE_URL", "");
    expect(testDatabaseUrl()).toContain("/testimonial_test");
  });

  it.each([
    ["the dev database name", "postgresql://u:p@localhost:54320/testimonial"],
    ["a non-local host", "postgresql://u:p@db.example.com:5432/app_test"],
    ["a look-alike host", "postgresql://u:p@localhost.evil.com:5432/app_test"],
    ["a name not ending in _test", "postgresql://u:p@127.0.0.1:5432/testimonial_test_backup"],
  ])("throws for %s", (_label, url) => {
    vi.stubEnv("TEST_DATABASE_URL", url);
    expect(() => testDatabaseUrl()).toThrow(/must point to a local database/);
  });
});
