import { z } from "zod";

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

/** Response of `GET /public/spaces/:slug/form` (FR-COL-01). */
export interface PublicFormDto {
  name: string;
  headline: string;
  message: string;
  prompts: string[];
  consent: { version: string; text: string };
}

/** Same body for stored and honeypot submissions, so a bot cannot tell them apart. */
export interface SubmissionReceipt {
  status: "received";
}
