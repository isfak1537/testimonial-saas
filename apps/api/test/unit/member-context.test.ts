import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/http/errors.js";
import { getTenant, requireMember } from "../../src/http/member-context.js";

const WS = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

async function run(
  workspaceId: unknown,
  membership: { role: "OWNER" } | null,
  allowed: readonly "OWNER"[] = ["OWNER"],
) {
  const find = vi.fn().mockResolvedValue(membership);
  const res = { locals: { session: { userId: USER, sessionId: "s" } } } as unknown as Response;
  const next = vi.fn();
  await requireMember(allowed, find)({ params: { workspaceId } } as unknown as Request, res, next);
  return { find, res, error: next.mock.calls[0]?.[0] as AppError | undefined };
}

describe("requireMember", () => {
  it("stores the verified context for a member", async () => {
    const { res, find, error } = await run(WS, { role: "OWNER" });
    expect(error).toBeUndefined();
    expect(find).toHaveBeenCalledWith(WS, USER);
    expect(getTenant(res)).toEqual({ userId: USER, workspaceId: WS, role: "OWNER" });
  });

  it("404s a non-member", async () => {
    const { error } = await run(WS, null);
    expect(error?.status).toBe(404);
  });

  it("404s a malformed id without touching the database", async () => {
    const { error, find } = await run("not-a-uuid", { role: "OWNER" });
    expect(error?.status).toBe(404);
    expect(find).not.toHaveBeenCalled();
  });

  it("403s a member whose role is not allowed (FR-TEN-05)", async () => {
    const { error } = await run(WS, { role: "OWNER" }, []);
    expect(error?.status).toBe(403);
    expect(error?.code).toBe("FORBIDDEN");
  });
});
