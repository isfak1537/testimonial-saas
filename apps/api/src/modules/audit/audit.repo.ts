import type { Db } from "../../db/types.js";
import type { TenantContext } from "../../http/member-context.js";

/** Ids and states only: nothing a visitor typed. */
export interface AuditMetadata {
  spaceId: string;
  from: string;
  to: string;
}

export type AuditAction =
  | "testimonial.approve"
  | "testimonial.reject"
  | "testimonial.publish"
  | "testimonial.unpublish"
  | "testimonial.withdraw_consent"
  | "testimonial.delete";

/**
 * FR-INB-10. `workspaceId` and `actorUserId` come from the verified membership (`getTenant`),
 * never from a parameter a caller could fill from input. Pass the transaction client so the row
 * commits or rolls back with the change it records. `metadata` must carry no personal data.
 */
export function writeAudit(
  db: Db,
  actor: Pick<TenantContext, "workspaceId" | "userId">,
  entry: { action: AuditAction; targetId: string; metadata: AuditMetadata },
) {
  return db.auditLog.create({
    data: {
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      action: entry.action,
      targetType: "Testimonial",
      targetId: entry.targetId,
      metadata: { ...entry.metadata },
    },
    select: { id: true },
  });
}
