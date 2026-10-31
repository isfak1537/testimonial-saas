import type { ListTestimonialsQuery, ModerationStatus } from "@testimonial-saas/shared";
import type { Db } from "../../db/types.js";
import { afterCursor, afterPublishedCursor } from "../../http/pagination.js";

export interface NewPendingTestimonial {
  authorName: string;
  authorTitle: string | null;
  authorEmail: string | null;
  rating: number;
  content: string;
  consentVersion: string;
}

/**
 * FR-COL-05. `workspaceId` and `spaceId` come from the looked-up Space; status, publication and
 * consent timestamps are fixed here so no caller can set them from request data.
 */
export function createPendingTestimonial(
  db: Db,
  workspaceId: string,
  spaceId: string,
  data: NewPendingTestimonial,
) {
  return db.testimonial.create({
    data: {
      ...data,
      workspaceId,
      spaceId,
      moderationStatus: "PENDING",
      publishedAt: null,
      consentGrantedAt: new Date(),
    },
    select: { id: true },
  });
}

// Every function below takes `workspaceId` and `spaceId` and uses both in every `where` (FR-TEN-04).
// Deleted rows are invisible to all of them.

export function listTestimonials(
  db: Db,
  workspaceId: string,
  spaceId: string,
  opts: ListTestimonialsQuery,
) {
  return db.testimonial.findMany({
    where: {
      workspaceId,
      spaceId,
      deletedAt: null,
      ...(opts.status ? { moderationStatus: opts.status } : {}),
      ...(opts.published === undefined
        ? {}
        : { publishedAt: opts.published ? { not: null } : null }),
      ...afterCursor(opts.cursor),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
  });
}

/**
 * The single definition of "public" (SRS Glossary): approved AND published AND consent not
 * withdrawn AND not deleted AND Space not archived. Every public read spreads this; nothing else
 * may spell these conditions out.
 */
export const PUBLIC_WHERE = {
  moderationStatus: "APPROVED",
  publishedAt: { not: null },
  consentWithdrawnAt: null,
  deletedAt: null,
  space: { archivedAt: null },
} as const;

/**
 * FR-WALL-02. `workspaceId` and `spaceId` come from the slug lookup, never from the request.
 * Selects only what the public mapper needs (SEC-06).
 */
export function listPublicTestimonials(
  db: Db,
  workspaceId: string,
  spaceId: string,
  opts: { limit: number; cursor?: string | undefined },
) {
  return db.testimonial.findMany({
    where: { workspaceId, spaceId, ...PUBLIC_WHERE, ...afterPublishedCursor(opts.cursor) },
    select: {
      id: true,
      authorName: true,
      authorTitle: true,
      rating: true,
      content: true,
      publishedAt: true,
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
  });
}

export function findTestimonial(db: Db, workspaceId: string, spaceId: string, id: string) {
  return db.testimonial.findFirst({ where: { id, workspaceId, spaceId, deletedAt: null } });
}

export type TestimonialAction =
  "approve" | "reject" | "publish" | "unpublish" | "withdraw-consent" | "delete";

/** Archived Spaces are read-only (ADR 0001), except for the privacy actions. */
export const FROZEN_WHEN_ARCHIVED: ReadonlySet<TestimonialAction> = new Set([
  "approve",
  "reject",
  "publish",
  "unpublish",
]);

/**
 * Applies one transition only if the row still satisfies its precondition, so a concurrent change
 * ends as `0` (the caller re-reads) and never as a row the publish guard would refuse.
 * Returns how many rows changed.
 */
export async function applyTestimonialAction(
  db: Db,
  workspaceId: string,
  spaceId: string,
  id: string,
  action: TestimonialAction,
  at: Date,
  /** The status the decision was made on, so the audit row's `from` is exact. */
  from: ModerationStatus,
): Promise<number> {
  // Moderation and publication are refused in an archived Space even if it was archived after the read.
  const live = {
    id,
    workspaceId,
    spaceId,
    deletedAt: null,
    ...(FROZEN_WHEN_ARCHIVED.has(action) ? { space: { archivedAt: null } } : {}),
  };
  const intact = { ...live, consentWithdrawnAt: null };
  const { count } = await (() => {
    switch (action) {
      case "approve":
        return db.testimonial.updateMany({
          where: { ...intact, moderationStatus: from },
          data: { moderationStatus: "APPROVED" },
        });
      case "reject":
        return db.testimonial.updateMany({
          where: { ...live, moderationStatus: from },
          data: { moderationStatus: "REJECTED", publishedAt: null },
        });
      case "publish":
        return db.testimonial.updateMany({
          where: { ...intact, moderationStatus: "APPROVED", publishedAt: null },
          data: { publishedAt: at },
        });
      case "unpublish":
        return db.testimonial.updateMany({
          where: { ...live, publishedAt: { not: null } },
          data: { publishedAt: null },
        });
      case "withdraw-consent":
        return db.testimonial.updateMany({
          where: intact,
          data: { consentWithdrawnAt: at, publishedAt: null },
        });
      case "delete":
        return db.testimonial.updateMany({
          where: live,
          data: { deletedAt: at, publishedAt: null },
        });
    }
  })();
  return count;
}
