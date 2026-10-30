import { Prisma } from "../generated/prisma/client.js";

interface UniqueViolationMeta {
  target?: unknown;
  driverAdapterError?: { cause?: { constraint?: { fields?: unknown; index?: unknown } } };
}

/**
 * The names (columns or index) behind a Prisma P2002, or null for any other error.
 * With the pg driver adapter Prisma 7 omits `meta.target` and reports the violated constraint
 * under `meta.driverAdapterError.cause.constraint` instead (`index: "Space_slug_key"`), so both
 * shapes are read.
 */
export function uniqueViolationNames(error: unknown): string[] | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }
  const meta = (error.meta ?? {}) as UniqueViolationMeta;
  const constraint = meta.driverAdapterError?.cause?.constraint;
  return [meta.target, constraint?.fields, constraint?.index]
    .flatMap((value) => (Array.isArray(value) ? value : value === undefined ? [] : [value]))
    .filter((name): name is string => typeof name === "string");
}

/** True only when the violated unique constraint involves `column` (`slug`, `Space_slug_key`). */
export function isUniqueViolationOn(error: unknown, column: string): boolean {
  const pattern = new RegExp(`(^|_)${column}(_|$)`);
  return uniqueViolationNames(error)?.some((name) => pattern.test(name)) ?? false;
}
