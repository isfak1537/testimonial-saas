import type {
  ModerationStatus,
  TestimonialDto,
  TestimonialListItemDto,
} from "@testimonial-saas/shared";

interface ListRow {
  id: string;
  spaceId: string;
  authorName: string;
  authorTitle: string | null;
  rating: number;
  content: string;
  moderationStatus: ModerationStatus;
  publishedAt: Date | null;
  consentWithdrawnAt: Date | null;
  createdAt: Date;
}

interface DetailRow extends ListRow {
  authorEmail: string | null;
  consentVersion: string;
  consentGrantedAt: Date;
  updatedAt: Date;
}

/** Allowlist mappers: no `workspaceId`, `deletedAt`, and never a spread of the row. */
export function toListItem(row: ListRow): TestimonialListItemDto {
  return {
    id: row.id,
    spaceId: row.spaceId,
    authorName: row.authorName,
    authorTitle: row.authorTitle,
    rating: row.rating,
    content: row.content,
    moderationStatus: row.moderationStatus,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    consentWithdrawnAt: row.consentWithdrawnAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toDetail(row: DetailRow): TestimonialDto {
  return {
    ...toListItem(row),
    authorEmail: row.authorEmail,
    consentVersion: row.consentVersion,
    consentGrantedAt: row.consentGrantedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
