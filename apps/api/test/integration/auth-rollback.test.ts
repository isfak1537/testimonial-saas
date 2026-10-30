import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authApp, post, signupBody } from "../helpers/auth-app.js";
import { disconnectTestPrisma, testPrisma, truncateAll } from "../helpers/test-db.js";

// Fail the last step of the sign-up transaction, after the user and workspace rows exist.
vi.mock("../../src/modules/auth/users.repo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/modules/auth/users.repo.js")>()),
  createOwnerMembership: vi.fn(async () => {
    throw new Error("simulated failure after user and workspace were written");
  }),
}));

const prisma = testPrisma();

beforeEach(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("sign-up transaction (FR-AUTH-02)", () => {
  it("rolls back user and workspace when the membership cannot be created", async () => {
    const { app } = authApp();
    const res = await post(app, "/api/v1/auth/signup").send(signupBody());
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(res.body)).not.toContain("simulated failure");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.workspace.count()).toBe(0);
    expect(await prisma.workspaceMember.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
  });
});
