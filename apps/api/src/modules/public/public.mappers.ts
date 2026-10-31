import {
  CURRENT_CONSENT_VERSION,
  renderConsentText,
  type PublicFormDto,
  type PublicWallDto,
  type PublicWallItemDto,
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

interface WallRow {
  id: string;
  authorName: string;
  authorTitle: string | null;
  rating: number;
  content: string;
  publishedAt: Date | null;
}

/** Public rows are published (PUBLIC_WHERE); a null here is a bug, so fail instead of inventing a date. */
export function publishedAtOf(row: { publishedAt: Date | null }): Date {
  if (!row.publishedAt) throw new Error("Public testimonial without publishedAt");
  return row.publishedAt;
}

/** FR-WALL-03. Field by field, so a new column can never reach the public by accident. */
export function toPublicWallItem(row: WallRow): PublicWallItemDto {
  return {
    id: row.id,
    authorName: row.authorName,
    authorTitle: row.authorTitle,
    rating: row.rating,
    content: row.content,
    publishedAt: publishedAtOf(row).toISOString(),
  };
}

export function toPublicWall(
  space: { name: string; headline: string },
  items: WallRow[],
  nextCursor: string | null,
): PublicWallDto {
  return {
    space: { name: space.name, headline: space.headline },
    testimonials: items.map(toPublicWallItem),
    nextCursor,
  };
}
