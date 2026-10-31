import type {
  ListTestimonialsQuery,
  ModerationStatus,
  TestimonialDto,
  TestimonialListResponse,
} from "@testimonial-saas/shared";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError, notFound } from "../../http/errors.js";
import type { TenantContext } from "../../http/member-context.js";
import { toPage } from "../../http/pagination.js";
import { writeAudit, type AuditAction } from "../audit/audit.repo.js";
import * as spaces from "../spaces/spaces.repo.js";
import { toDetail, toListItem } from "./testimonials.mappers.js";
import * as repo from "./testimonials.repo.js";
import { FROZEN_WHEN_ARCHIVED, type TestimonialAction } from "./testimonials.repo.js";

export interface TransitionState {
  status: ModerationStatus;
  published: boolean;
  withdrawn: boolean;
  spaceArchived: boolean;
}

export type Decision = "apply" | "noop" | "invalid";

/**
 * The transition table (FR-INB-04..08). Pure, so it can be tested for every state. Deleted rows
 * never get here: they are not found, which is a 404.
 */
export function decide(action: TestimonialAction, s: TransitionState): Decision {
  if (s.spaceArchived && FROZEN_WHEN_ARCHIVED.has(action)) return "invalid";
  switch (action) {
    case "approve":
      if (s.withdrawn) return "invalid";
      return s.status === "APPROVED" ? "noop" : "apply";
    case "reject":
      return s.status === "REJECTED" ? "noop" : "apply";
    case "publish":
      if (s.status !== "APPROVED" || s.withdrawn) return "invalid";
      return s.published ? "noop" : "apply";
    case "unpublish":
      return s.published ? "apply" : "noop";
    case "withdraw-consent":
      return s.withdrawn ? "noop" : "apply";
    case "delete":
      return "apply";
  }
}

const AUDIT_ACTIONS: Record<TestimonialAction, AuditAction> = {
  approve: "testimonial.approve",
  reject: "testimonial.reject",
  publish: "testimonial.publish",
  unpublish: "testimonial.unpublish",
  "withdraw-consent": "testimonial.withdraw_consent",
  delete: "testimonial.delete",
};

const invalidState = (message: string) => new AppError(409, "INVALID_STATE", message);

export function createTestimonialsService(prisma: PrismaClient) {
  /** A Space of another workspace, or none, is a 404; an archived one is returned for the rules. */
  async function requireSpace(workspaceId: string, spaceId: string) {
    const space = await spaces.findSpace(prisma, workspaceId, spaceId);
    if (!space) throw notFound();
    return space;
  }

  return {
    /** FR-INB-01..02. */
    async list(
      workspaceId: string,
      spaceId: string,
      query: ListTestimonialsQuery,
    ): Promise<TestimonialListResponse> {
      await requireSpace(workspaceId, spaceId);
      const rows = await repo.listTestimonials(prisma, workspaceId, spaceId, query);
      const page = toPage(rows, query.limit);
      return { items: page.items.map(toListItem), nextCursor: page.nextCursor };
    },

    /** FR-INB-03. */
    async get(workspaceId: string, spaceId: string, id: string): Promise<TestimonialDto> {
      await requireSpace(workspaceId, spaceId);
      const row = await repo.findTestimonial(prisma, workspaceId, spaceId, id);
      if (!row) throw notFound();
      return toDetail(row);
    },

    /**
     * FR-INB-04..08, 10. `tenant` is the verified membership; its workspace is used for every
     * lookup and for the audit row. An effective change and its audit row share one transaction;
     * a no-op or a refused call writes nothing.
     */
    async act(
      tenant: TenantContext,
      spaceId: string,
      id: string,
      action: TestimonialAction,
    ): Promise<TestimonialDto | null> {
      const { workspaceId } = tenant;
      return prisma.$transaction(async (tx) => {
        const space = await spaces.findSpace(tx, workspaceId, spaceId);
        if (!space) throw notFound();
        const before = await repo.findTestimonial(tx, workspaceId, spaceId, id);
        if (!before) throw notFound();

        const decision = decide(action, {
          status: before.moderationStatus,
          published: before.publishedAt !== null,
          withdrawn: before.consentWithdrawnAt !== null,
          spaceArchived: space.archivedAt !== null,
        });
        if (decision === "invalid") {
          throw invalidState(
            `Cannot ${action.replace("-", " ")} this testimonial in its current state`,
          );
        }
        if (decision === "apply") {
          const count = await repo.applyTestimonialAction(
            tx,
            workspaceId,
            spaceId,
            id,
            action,
            new Date(),
            before.moderationStatus,
          );
          if (count === 0) {
            // Changed by someone else since we read it: gone is 404, anything else is a conflict.
            if (!(await repo.findTestimonial(tx, workspaceId, spaceId, id))) throw notFound();
            throw invalidState("The testimonial changed; reload and try again");
          }
          const after = await repo.findTestimonial(tx, workspaceId, spaceId, id);
          await writeAudit(tx, tenant, {
            action: AUDIT_ACTIONS[action],
            targetId: id,
            metadata: {
              spaceId,
              from: before.moderationStatus,
              to: after?.moderationStatus ?? before.moderationStatus,
            },
          });
          return after ? toDetail(after) : null;
        }
        return toDetail(before);
      });
    },
  };
}

export type TestimonialsService = ReturnType<typeof createTestimonialsService>;
