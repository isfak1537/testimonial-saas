import { createPrisma } from "../../src/db/client.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";

// Local-only default; matches the `db-test` service in docker-compose.yml and .env.example.
const DEFAULT_TEST_DATABASE_URL =
  "postgresql://testimonial:testimonial_test@localhost:54330/testimonial_test";

/**
 * Integration tests truncate every table and create/drop databases, so refuse anything that
 * is not an obvious local throwaway database (name ends in `_test`, host is loopback).
 */
export function testDatabaseUrl(): string {
  const url = process.env["TEST_DATABASE_URL"] || DEFAULT_TEST_DATABASE_URL;
  const { hostname, pathname } = new URL(url);
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1";
  if (!isLoopback || !pathname.slice(1).endsWith("_test")) {
    throw new Error(
      "TEST_DATABASE_URL must point to a local database whose name ends in _test; " +
        "integration tests wipe it.",
    );
  }
  return url;
}

let client: PrismaClient | undefined;

export function testPrisma(): PrismaClient {
  client ??= createPrisma(testDatabaseUrl());
  return client;
}

export async function disconnectTestPrisma(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

/** Empties every table except Prisma's migration history, which must survive. */
export async function truncateAll(prisma: PrismaClient = testPrisma()): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename.replaceAll('"', '""')}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
