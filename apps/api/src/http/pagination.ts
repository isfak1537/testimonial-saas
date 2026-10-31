import { z } from "zod";
import { AppError } from "./errors.js";

const uuid = z.uuid();
// Exactly what `Date#toISOString` emits for years 0000-9999, so a crafted cursor cannot reach Postgres out of range.
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Newest-first keyset position. Opaque to clients; ties on `createdAt` are broken by `id`. */
export interface CursorPosition {
  createdAt: Date;
  id: string;
}

export function encodeCursor({ createdAt, id }: CursorPosition): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

const invalidCursor = () =>
  new AppError(422, "VALIDATION_FAILED", "Validation failed", [
    { path: "cursor", message: "Invalid cursor" },
  ]);

export function decodeCursor(cursor: string): CursorPosition {
  const [iso, id, ...rest] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso ?? "");
  if (
    rest.length > 0 ||
    !iso ||
    !ISO_TIMESTAMP.test(iso) ||
    !id ||
    !uuid.safeParse(id).success ||
    Number.isNaN(createdAt.getTime())
  ) {
    throw invalidCursor();
  }
  return { createdAt, id };
}

/** Prisma `where` fragment for "strictly after the cursor" in `createdAt desc, id desc` order. */
export function afterCursor(cursor: string | undefined) {
  if (!cursor) return {};
  const { createdAt, id } = decodeCursor(cursor);
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}

/**
 * Same as `afterCursor` for lists ordered `publishedAt desc, id desc` (the public Wall). The
 * cursor only moves the position inside a list whose tenant and Space filters are fixed by the
 * caller, so a cursor from another Space cannot reach that Space's rows.
 */
export function afterPublishedCursor(cursor: string | undefined) {
  if (!cursor) return {};
  const { createdAt: publishedAt, id } = decodeCursor(cursor);
  return { OR: [{ publishedAt: { lt: publishedAt } }, { publishedAt, id: { lt: id } }] };
}

/**
 * Pass the rows fetched with `take: limit + 1`; trims the extra row and builds `nextCursor`.
 * Lists ordered by another timestamp (the Wall's `publishedAt`) say so with `position`.
 */
export function toPage<T extends CursorPosition>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null };
export function toPage<T>(
  rows: T[],
  limit: number,
  position: (row: T) => CursorPosition,
): { items: T[]; nextCursor: string | null };
export function toPage<T>(
  rows: T[],
  limit: number,
  position: (row: T) => CursorPosition = (row) => row as CursorPosition,
) {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(position(last)) : null };
}
