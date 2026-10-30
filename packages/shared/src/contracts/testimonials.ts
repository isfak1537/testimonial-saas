import { z } from "zod";
import { pageQuery, type Page } from "./spaces.js";

export const MODERATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

// SRS FR-INB-01..02. Query strings are parsed explicitly, never `z.coerce`.
export const listTestimonialsQuery = pageQuery.extend({
  status: z.enum(MODERATION_STATUSES).optional(),
  published: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

/**
 * FR-TEN-03 / FR-INB-09: actions take no input. An absent body is `{}`; any key, such as
 * `moderationStatus` or `publishedAt`, gives 422.
 */
export const testimonialActionBody = z.preprocess((value) => value ?? {}, z.strictObject({}));

export type ListTestimonialsQuery = z.infer<typeof listTestimonialsQuery>;

/** What the Inbox list shows. No `authorEmail` (FR-INB-03: detail only). */
export interface TestimonialListItemDto {
  id: string;
  spaceId: string;
  authorName: string;
  authorTitle: string | null;
  rating: number;
  content: string;
  moderationStatus: ModerationStatus;
  publishedAt: string | null;
  consentWithdrawnAt: string | null;
  createdAt: string;
}

/** FR-INB-03: the full record for the owner, including the private `authorEmail`. */
export interface TestimonialDto extends TestimonialListItemDto {
  authorEmail: string | null;
  consentVersion: string;
  consentGrantedAt: string;
  updatedAt: string;
}

export type TestimonialListResponse = Page<TestimonialListItemDto>;
