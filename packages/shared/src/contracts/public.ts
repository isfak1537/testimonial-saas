import { z } from "zod";
import { pageQuery } from "./spaces.js";

// SRS FR-COL-02. Strict: workspaceId, spaceId, moderationStatus, consent dates, ... give 422.
export const submitTestimonialBody = z.strictObject({
  authorName: z.string().trim().min(1).max(80),
  authorTitle: z.string().trim().max(120).optional(),
  authorEmail: z.string().trim().toLowerCase().pipe(z.email().max(254)).optional(),
  rating: z.number().int().min(1).max(5),
  content: z.string().trim().min(10).max(2000),
  consent: z.literal(true, "Consent is required"),
  consentVersion: z.string().min(1).max(40),
  // Honeypot (FR-COL-04): real visitors never see it, so it stays empty.
  website: z.string().max(200).optional(),
});

export type SubmitTestimonialBody = z.infer<typeof submitTestimonialBody>;

// SRS FR-WALL-05: `limit` default 20, max 50; unknown keys give 422.
export const wallQuery = pageQuery;
export type WallQuery = z.infer<typeof wallQuery>;

/** Response of `GET /public/spaces/:slug/form` (FR-COL-01). */
export interface PublicFormDto {
  name: string;
  headline: string;
  message: string;
  prompts: string[];
  consent: { version: string; text: string };
}

/** One public testimonial (FR-WALL-03). Exactly these keys; the API builds it field by field. */
export interface PublicWallItemDto {
  id: string;
  authorName: string;
  authorTitle: string | null;
  rating: number;
  content: string;
  publishedAt: string;
}

/** Response of `GET /public/spaces/:slug/wall` (FR-WALL-01). */
export interface PublicWallDto {
  space: { name: string; headline: string };
  testimonials: PublicWallItemDto[];
  nextCursor: string | null;
}

/** Same body for stored and honeypot submissions, so a bot cannot tell them apart. */
export interface SubmissionReceipt {
  status: "received";
}
