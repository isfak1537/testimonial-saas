import type { Db } from "../../db/types.js";

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
