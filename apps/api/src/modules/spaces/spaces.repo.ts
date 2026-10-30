import type { CreateSpaceBody, UpdateSpaceBody } from "@testimonial-saas/shared";
import type { Db } from "../../db/types.js";
import { afterCursor } from "../../http/pagination.js";

// Every function takes `workspaceId` and uses it in every `where` (FR-TEN-04).

export function listSpaces(
  db: Db,
  workspaceId: string,
  opts: { limit: number; cursor?: string; includeArchived: boolean },
) {
  return db.space.findMany({
    where: {
      workspaceId,
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      ...afterCursor(opts.cursor),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
  });
}

export function findSpace(db: Db, workspaceId: string, id: string) {
  return db.space.findFirst({ where: { id, workspaceId } });
}

export function createSpace(db: Db, workspaceId: string, data: CreateSpaceBody) {
  return db.space.create({ data: { ...data, workspaceId } });
}

/** Returns how many rows changed: 0 when missing, in another workspace, or archived. */
export async function updateActiveSpace(
  db: Db,
  workspaceId: string,
  id: string,
  data: UpdateSpaceBody,
): Promise<number> {
  const { count } = await db.space.updateMany({
    where: { id, workspaceId, archivedAt: null },
    data,
  });
  return count;
}

/** Sets `archivedAt` once; an already archived Space keeps its first timestamp. */
export async function archiveActiveSpace(
  db: Db,
  workspaceId: string,
  id: string,
  at: Date,
): Promise<number> {
  const { count } = await db.space.updateMany({
    where: { id, workspaceId, archivedAt: null },
    data: { archivedAt: at },
  });
  return count;
}
