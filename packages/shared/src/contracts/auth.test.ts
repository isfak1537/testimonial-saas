import { describe, expect, it } from "vitest";
import { loginBody, signupBody } from "./auth.js";

const valid = { email: "ada@example.com", password: "correct horse", displayName: "Ada" };

describe("signupBody", () => {
  it("trims and lowercases the email and trims the display name", () => {
    const parsed = signupBody.parse({
      ...valid,
      email: "  Ada@Example.COM ",
      displayName: " Ada ",
    });
    expect(parsed.email).toBe("ada@example.com");
    expect(parsed.displayName).toBe("Ada");
  });

  it("enforces password length 10-128", () => {
    expect(signupBody.safeParse({ ...valid, password: "a".repeat(9) }).success).toBe(false);
    expect(signupBody.safeParse({ ...valid, password: "a".repeat(10) }).success).toBe(true);
    expect(signupBody.safeParse({ ...valid, password: "a".repeat(128) }).success).toBe(true);
    expect(signupBody.safeParse({ ...valid, password: "a".repeat(129) }).success).toBe(false);
  });

  it("enforces a trimmed display name of 1-80 characters", () => {
    expect(signupBody.safeParse({ ...valid, displayName: "   " }).success).toBe(false);
    expect(signupBody.safeParse({ ...valid, displayName: "x".repeat(80) }).success).toBe(true);
    expect(signupBody.safeParse({ ...valid, displayName: "x".repeat(81) }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(signupBody.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(signupBody.safeParse({ ...valid, workspaceId: "x" }).success).toBe(false);
    expect(signupBody.safeParse({ ...valid, role: "OWNER" }).success).toBe(false);
  });
});

describe("loginBody", () => {
  it("accepts a short password (only sign-up enforces the minimum) but not an empty one", () => {
    expect(loginBody.safeParse({ email: "a@b.co", password: "short" }).success).toBe(true);
    expect(loginBody.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(loginBody.safeParse({ email: "a@b.co", password: "x", extra: 1 }).success).toBe(false);
  });
});
