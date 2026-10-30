import { z } from "zod";

// SRS FR-SPACE-03.
export const RESERVED_SLUGS: readonly string[] = [
  "admin",
  "api",
  "app",
  "assets",
  "c",
  "embed",
  "help",
  "login",
  "logout",
  "signup",
  "support",
  "w",
  "www",
];

// SRS FR-SPACE-02. Input is trimmed and lowercased before it is validated.
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .regex(SLUG_PATTERN, "Use 3-40 lowercase letters, digits or hyphens, not at either end")
      .refine((value) => !RESERVED_SLUGS.includes(value), "This slug is reserved"),
  );

const name = z.string().trim().min(1).max(80);
const headline = z.string().trim().min(1).max(120);
const message = z.string().trim().max(500);
const prompts = z.array(z.string().trim().min(1).max(200)).max(5);

// SRS FR-SPACE-01. Strict: workspaceId, id, archivedAt, ... give 422 (FR-TEN-03).
export const createSpaceBody = z.strictObject({
  name,
  slug,
  headline,
  message: message.default(""),
  prompts: prompts.default([]),
});

export const updateSpaceBody = z
  .strictObject({ name, slug, headline, message, prompts })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field to change");

// Query strings: parsed explicitly, never `z.coerce` ("false" would become true).
const limit = z
  .string()
  .regex(/^\d+$/, "Must be a whole number")
  .transform(Number)
  .pipe(z.number().min(1).max(50))
  .default(20);
const cursor = z.string().min(1).max(200).optional();

/** Pagination query shared by every list endpoint (I07 reuses it). */
export const pageQuery = z.strictObject({ limit, cursor });

export const listSpacesQuery = pageQuery.extend({
  includeArchived: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default(false),
});

export type CreateSpaceBody = z.infer<typeof createSpaceBody>;
export type UpdateSpaceBody = z.infer<typeof updateSpaceBody>;
export type ListSpacesQuery = z.infer<typeof listSpacesQuery>;

export type PageQuery = z.infer<typeof pageQuery>;

export interface SpaceDto {
  id: string;
  name: string;
  slug: string;
  headline: string;
  message: string;
  prompts: string[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type SpaceListResponse = Page<SpaceDto>;
