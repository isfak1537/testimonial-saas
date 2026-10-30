import {
  CURRENT_CONSENT_VERSION,
  type PublicFormDto,
  type SubmissionReceipt,
  type SubmitTestimonialBody,
} from "@testimonial-saas/shared";
import type { Db } from "../../db/types.js";
import { AppError, notFound } from "../../http/errors.js";
import { findActiveSpaceBySlug } from "../spaces/spaces.repo.js";
import { createPendingTestimonial } from "../testimonials/testimonials.repo.js";
import { toPublicForm } from "./public.mappers.js";

export function createPublicService(db: Db) {
  return {
    /** FR-COL-01. Unknown and archived Spaces are the same 404. */
    async getForm(slug: string): Promise<PublicFormDto> {
      const space = await findActiveSpaceBySlug(db, slug);
      if (!space) throw notFound();
      return toPublicForm(space);
    },

    /** FR-COL-02..05. Order: 404, honeypot (silent success), consent version (409), store. */
    async submit(slug: string, body: SubmitTestimonialBody): Promise<SubmissionReceipt> {
      const space = await findActiveSpaceBySlug(db, slug);
      if (!space) throw notFound();
      const receipt: SubmissionReceipt = { status: "received" };
      if (body.website) return receipt;
      if (body.consentVersion !== CURRENT_CONSENT_VERSION) {
        throw new AppError(
          409,
          "CONSENT_VERSION_OUTDATED",
          "The consent text has changed, please reload the page",
        );
      }
      try {
        await createPendingTestimonial(db, space.workspaceId, space.id, {
          authorName: body.authorName,
          authorTitle: body.authorTitle || null,
          authorEmail: body.authorEmail ?? null,
          rating: body.rating,
          content: body.content,
          consentVersion: body.consentVersion,
        });
      } catch {
        // A Prisma error message can embed the call arguments (authorEmail, content), and the
        // error handler logs `err`. Never let those reach the logs (SEC-04).
        throw new AppError(500, "INTERNAL", "Something went wrong");
      }
      return receipt;
    },
  };
}

export type PublicService = ReturnType<typeof createPublicService>;
