import type { Db } from "../../db/types.js";

export function createSession(
  db: Db,
  data: { tokenHash: string; userId: string; expiresAt: Date },
) {
  return db.session.create({ data, select: { id: true } });
}

/** Only unexpired sessions are returned; an expired row behaves like a missing one. */
export function findActiveSession(db: Db, tokenHash: string, now: Date) {
  return db.session.findFirst({
    where: { tokenHash, expiresAt: { gt: now } },
    select: { id: true, userId: true },
  });
}

export async function deleteSessionByTokenHash(db: Db, tokenHash: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash } });
}

export async function deleteSessionById(db: Db, id: string): Promise<void> {
  await db.session.deleteMany({ where: { id } });
}
