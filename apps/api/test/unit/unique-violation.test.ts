import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client.js";
import { isEmailUniqueViolation } from "../../src/modules/auth/auth.service.js";

function p2002(meta: Record<string, unknown>, code = "P2002") {
  return new Prisma.PrismaClientKnownRequestError("unique", {
    code,
    clientVersion: "test",
    meta,
  });
}

describe("isEmailUniqueViolation", () => {
  it("matches the driver-adapter shape (index User_email_key)", () => {
    const meta = {
      driverAdapterError: { cause: { constraint: { index: "User_email_key" } } },
    };
    expect(isEmailUniqueViolation(p2002(meta))).toBe(true);
  });

  it("matches the classic meta.target shapes", () => {
    expect(isEmailUniqueViolation(p2002({ target: ["email"] }))).toBe(true);
    expect(isEmailUniqueViolation(p2002({ target: "User_email_key" }))).toBe(true);
  });

  it("does not match another target, another code or a non-Prisma error", () => {
    expect(isEmailUniqueViolation(p2002({ target: ["slug"] }))).toBe(false);
    expect(isEmailUniqueViolation(p2002({}))).toBe(false);
    expect(isEmailUniqueViolation(p2002({ target: ["email"] }, "P2003"))).toBe(false);
    expect(isEmailUniqueViolation(new Error("email"))).toBe(false);
  });
});
