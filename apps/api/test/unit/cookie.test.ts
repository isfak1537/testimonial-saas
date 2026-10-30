import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  clearSessionCookie,
  SESSION_COOKIE,
  setSessionCookie,
} from "../../src/modules/auth/cookie.js";

function fakeRes() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

describe("session cookie (FR-AUTH-06)", () => {
  it("is HttpOnly, SameSite=Lax, Path=/ with the configured lifetime, not Secure on http", () => {
    const res = fakeRes();
    setSessionCookie(res, { APP_ORIGIN: "http://localhost:3000", SESSION_TTL_DAYS: 7 }, "tok");
    expect(res.cookie).toHaveBeenCalledWith(SESSION_COOKIE, "tok", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  });

  it("is Secure when APP_ORIGIN is https", () => {
    const res = fakeRes();
    setSessionCookie(res, { APP_ORIGIN: "https://app.example.com", SESSION_TTL_DAYS: 2 }, "tok");
    expect(res.cookie.mock.calls[0]?.[2]).toMatchObject({ secure: true, maxAge: 172_800_000 });
  });

  it("clears with the same attributes so the browser matches it", () => {
    const res = fakeRes();
    clearSessionCookie(res, { APP_ORIGIN: "https://app.example.com", SESSION_TTL_DAYS: 7 });
    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
    });
  });
});
