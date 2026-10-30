import {
  CURRENT_CONSENT_VERSION,
  renderConsentText,
  type PublicFormDto,
} from "@testimonial-saas/shared";

interface PublicSpaceRow {
  name: string;
  headline: string;
  message: string;
  // Prisma lists are nullable in the database (ADR 0001 follow-up).
  prompts: string[] | null;
}

/** Allowlist mapper (SEC-06): no ids, no `workspaceId`, never a spread of the row. */
export function toPublicForm(row: PublicSpaceRow): PublicFormDto {
  return {
    name: row.name,
    headline: row.headline,
    message: row.message,
    prompts: row.prompts ?? [],
    consent: {
      version: CURRENT_CONSENT_VERSION,
      text: renderConsentText(CURRENT_CONSENT_VERSION, row.name),
    },
  };
}
