import type { Db } from "../../db/types.js";

export function findUserByEmail(db: Db, email: string) {
  return db.user.findUnique({
    where: { email },
    select: { id: true, email: true, displayName: true, passwordHash: true },
  });
}

export function findUserById(db: Db, id: string) {
  return db.user.findUnique({
    where: { id },
    select: { id: true, email: true, displayName: true },
  });
}

export function createUser(
  db: Db,
  data: { email: string; passwordHash: string; displayName: string },
) {
  return db.user.create({
    data,
    select: { id: true, email: true, displayName: true },
  });
}

export function createWorkspace(db: Db, name: string) {
  return db.workspace.create({ data: { name }, select: { id: true, name: true } });
}

export async function createOwnerMembership(
  db: Db,
  workspaceId: string,
  userId: string,
): Promise<void> {
  await db.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
}

/**
 * The one documented tenant-bootstrap exception to FR-TEN-04: it is keyed by `userId` alone
 * (taken from a verified session) because the caller does not know a workspace yet. It returns
 * only that user's own membership. Every later tenant query takes `workspaceId` from
 * `requireMember`, never from here.
 */
export function findMembershipByUserId(db: Db, userId: string) {
  return db.workspaceMember.findFirst({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { workspaceId: "asc" }],
    select: { role: true, workspace: { select: { id: true, name: true } } },
  });
}
