import argon2 from "argon2";
import { describe, expect, it } from "vitest";
import {
  ARGON2_OPTIONS,
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from "../../src/modules/auth/password.js";

describe("password hashing (FR-AUTH-05)", () => {
  it("pins argon2id with 64 MiB, 3 passes, 4 lanes", () => {
    expect(ARGON2_OPTIONS).toEqual({
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 4,
    });
  });

  it("produces an argon2id hash with those parameters that verifies", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,p=4,t=3\$/);
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong password")).toBe(false);
  });

  it("treats a malformed stored hash as a mismatch, not an error", async () => {
    expect(await verifyPassword("factory-placeholder", "anything")).toBe(false);
  });

  it("the dummy check is always false", async () => {
    expect(await verifyAgainstDummy("anything")).toBe(false);
  });
});
