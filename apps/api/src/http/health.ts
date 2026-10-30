import type { RequestHandler } from "express";
import type { Logger } from "pino";
import type { PrismaClient } from "../generated/prisma/client.js";

const DB_PING_TIMEOUT_MS = 2_000;
// Probes (Docker, load balancers) can be frequent: share one ping between requests this close.
const RESULT_TTL_MS = 1_000;

async function pingDb(prisma: PrismaClient): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("database ping timed out")), DB_PING_TIMEOUT_MS);
  });
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * FR-OPS-02. Public and unauthenticated: reveals only whether the database answers.
 * The cache is per handler (so per app), never module-level, so apps and tests stay independent.
 */
export function health(prisma: PrismaClient, logger: Logger): RequestHandler {
  let cache: { at: number; result: Promise<boolean> } | undefined;
  return async (_req, res) => {
    const now = Date.now();
    const startedPing = !cache || now - cache.at >= RESULT_TTL_MS;
    if (!cache || startedPing) cache = { at: now, result: pingDb(prisma) };
    const dbUp = await cache.result;
    if (!dbUp && startedPing) {
      const log = (res.locals["log"] as Logger | undefined) ?? logger;
      log.error("health check: database unreachable");
    }
    res
      .status(dbUp ? 200 : 503)
      .json({ status: dbUp ? "ok" : "degraded", db: dbUp ? "up" : "down" });
  };
}
