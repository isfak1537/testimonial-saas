import type { Db } from "../db/types.js";
import { deleteExpiredSessions, countExpiredSessions } from "../modules/auth/sessions.repo.js";
import {
  countDeletedBefore,
  deleteDeletedBefore,
} from "../modules/testimonials/testimonials.repo.js";

/** FR-OPS-01: a soft-deleted testimonial is kept this long, then removed for good. */
export const RETENTION_DAYS = 30;

export interface PurgeCounts {
  testimonials: number;
  sessions: number;
}

export function testimonialCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/** What a run would delete at `now`. Touches nothing. */
export async function countPurgeTargets(db: Db, now: Date): Promise<PurgeCounts> {
  return {
    testimonials: await countDeletedBefore(db, testimonialCutoff(now)),
    sessions: await countExpiredSessions(db, now),
  };
}

/** Deletes testimonials deleted more than 30 days ago and expired sessions. */
export async function purge(db: Db, now: Date): Promise<PurgeCounts> {
  return {
    testimonials: await deleteDeletedBefore(db, testimonialCutoff(now)),
    sessions: await deleteExpiredSessions(db, now),
  };
}

/** Dry-run is the default; only the exact flag `--confirm` deletes, anything else is an error. */
export function parsePurgeArgs(argv: readonly string[]): { confirm: boolean } {
  let confirm = false;
  for (const arg of argv) {
    if (arg === "--confirm") confirm = true;
    else throw new Error(`Unknown argument: ${arg}. Usage: purge:deleted [--confirm]`);
  }
  return { confirm };
}

/** The database name only; host, user and password never reach the output. */
export function databaseName(databaseUrl: string): string {
  try {
    const name = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    return name || "(unknown)";
  } catch {
    return "(unknown)";
  }
}
