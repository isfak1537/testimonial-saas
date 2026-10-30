import type { SpaceDto } from "@testimonial-saas/shared";

interface SpaceRow {
  id: string;
  name: string;
  slug: string;
  headline: string;
  message: string;
  // Prisma lists are nullable in the database (ADR 0001 follow-up).
  prompts: string[] | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Allowlist mapper: no `workspaceId`, never a spread of the row. */
export function toSpace(row: SpaceRow): SpaceDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    headline: row.headline,
    message: row.message,
    prompts: row.prompts ?? [],
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
