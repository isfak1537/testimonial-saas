import { describe, expect, it } from "vitest";
import { hashToken, newSessionToken } from "../../src/modules/auth/session-token.js";

describe("session tokens (FR-AUTH-07)", () => {
  it("is 32 random bytes as base64url and never repeats", () => {
    const a = newSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(newSessionToken()).not.toBe(a);
  });

  it("hashes with SHA-256 hex, deterministically, without containing the token", () => {
    const token = newSessionToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });
});
