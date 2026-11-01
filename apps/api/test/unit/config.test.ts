import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig auth settings", () => {
  it("defaults outside production", () => {
    const config = loadConfig({});
    expect(config.APP_ORIGIN).toBe("http://localhost:3000");
    expect(config.SESSION_TTL_DAYS).toBe(7);
    expect(config.AUTH_RATE_LIMIT_MAX).toBe(10);
    expect(config.SUBMISSION_RATE_LIMIT_MAX).toBe(5);
  });

  it("requires APP_ORIGIN in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/APP_ORIGIN/);
    expect(
      loadConfig({ NODE_ENV: "production", APP_ORIGIN: "https://app.example.com" }),
    ).toMatchObject({ APP_ORIGIN: "https://app.example.com" });
  });

  it("rejects a non-https APP_ORIGIN in production unless the host is loopback", () => {
    for (const bad of [
      "http://app.example.com",
      "http://10.0.0.5:3000",
      "http://localhost.example.com",
    ]) {
      expect(() => loadConfig({ NODE_ENV: "production", APP_ORIGIN: bad })).toThrow(/https/);
    }
    for (const ok of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://app.example.com",
    ]) {
      expect(loadConfig({ NODE_ENV: "production", APP_ORIGIN: ok }).APP_ORIGIN).toBe(ok);
    }
    // Outside production any http origin is fine (Vite dev, tests).
    expect(loadConfig({ APP_ORIGIN: "http://app.example.com" }).APP_ORIGIN).toBe(
      "http://app.example.com",
    );
  });

  it("normalises a trailing slash and rejects anything that is not a bare origin", () => {
    expect(loadConfig({ APP_ORIGIN: "http://localhost:5173/" }).APP_ORIGIN).toBe(
      "http://localhost:5173",
    );
    for (const bad of [
      "https://app.example.com/path",
      "ftp://x.test",
      "https://u:p@x.test",
      "nope",
    ]) {
      expect(() => loadConfig({ APP_ORIGIN: bad })).toThrow(/APP_ORIGIN/);
    }
  });

  it("reads the limiter maximum and session lifetime", () => {
    const config = loadConfig({ AUTH_RATE_LIMIT_MAX: "500", SESSION_TTL_DAYS: "3" });
    expect(config.AUTH_RATE_LIMIT_MAX).toBe(500);
    expect(config.SESSION_TTL_DAYS).toBe(3);
  });
});

describe("loadConfig wall limit", () => {
  it("defaults to 120 and is bounded", () => {
    expect(loadConfig({}).WALL_RATE_LIMIT_MAX).toBe(120);
    expect(() => loadConfig({ WALL_RATE_LIMIT_MAX: "0" })).toThrow(/WALL_RATE_LIMIT_MAX/);
  });
});

describe("loadConfig submission limit", () => {
  it("is configurable and bounded", () => {
    expect(loadConfig({ SUBMISSION_RATE_LIMIT_MAX: "1000" }).SUBMISSION_RATE_LIMIT_MAX).toBe(1000);
    expect(() => loadConfig({ SUBMISSION_RATE_LIMIT_MAX: "0" })).toThrow(
      /SUBMISSION_RATE_LIMIT_MAX/,
    );
  });
});

describe("loadConfig form limit", () => {
  it("defaults to 60 and is bounded", () => {
    expect(loadConfig({}).FORM_RATE_LIMIT_MAX).toBe(60);
    expect(loadConfig({ FORM_RATE_LIMIT_MAX: "1000" }).FORM_RATE_LIMIT_MAX).toBe(1000);
    expect(() => loadConfig({ FORM_RATE_LIMIT_MAX: "0" })).toThrow(/FORM_RATE_LIMIT_MAX/);
  });
});
