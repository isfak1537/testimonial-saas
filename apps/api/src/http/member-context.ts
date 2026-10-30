import type { RequestHandler, Response } from "express";
import { z } from "zod";
import type { MemberRole } from "../generated/prisma/enums.js";
import { getSession } from "./auth-context.js";
import { AppError, notFound } from "./errors.js";

export interface TenantContext {
  userId: string;
  workspaceId: string;
  role: MemberRole;
}

export type FindMembership = (
  workspaceId: string,
  userId: string,
) => Promise<{ role: MemberRole } | null>;

const KEY = "tenant";
const uuid = z.uuid();

/**
 * §3.2 / FR-TEN-01..02, 05: reads `:workspaceId` from the URL and checks it against the session
 * user. A malformed id, an unknown workspace and a workspace the user is not in all give the same
 * 404, so existence is not revealed. A member without an allowed role gets 403.
 * Mount after `requireSession`.
 */
export function requireMember(
  allowedRoles: readonly MemberRole[],
  findMembership: FindMembership,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const workspaceId: unknown = req.params["workspaceId"];
      if (typeof workspaceId !== "string" || !uuid.safeParse(workspaceId).success) {
        throw notFound();
      }
      const { userId } = getSession(res);
      const membership = await findMembership(workspaceId, userId);
      if (!membership) throw notFound();
      if (!allowedRoles.includes(membership.role)) {
        throw new AppError(403, "FORBIDDEN", "You do not have access to this action");
      }
      res.locals[KEY] = { userId, workspaceId, role: membership.role } satisfies TenantContext;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Only valid behind `requireMember`. `workspaceId` here is verified; never read it from a body. */
export function getTenant(res: Response): TenantContext {
  return res.locals[KEY] as TenantContext;
}
