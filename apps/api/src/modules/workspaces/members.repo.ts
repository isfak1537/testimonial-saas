import type { Db } from "../../db/types.js";

/** FR-TEN-01: the membership for exactly this (workspace, user) pair, or null. */
export function findMembership(db: Db, workspaceId: string, userId: string) {
  return db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
}
