import { readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { migrateDeploy } from "../helpers/migrate.js";
import { testDatabaseUrl } from "../helpers/test-db.js";

const migrationsDir = path.resolve(import.meta.dirname, "../../prisma/migrations");

function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

describe("migrations", () => {
  it("all apply to an empty database and create every table and CHECK constraint", async () => {
    const dbName = `migrations_check_${process.pid}_${Date.now()}`;
    const admin = new Client({ connectionString: testDatabaseUrl() });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${dbName}"`);
      const freshUrl = withDatabase(testDatabaseUrl(), dbName);

      migrateDeploy(freshUrl);

      const fresh = new Client({ connectionString: freshUrl });
      await fresh.connect();
      try {
        const tables = await fresh.query<{ tablename: string }>(
          `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
        );
        expect(tables.rows.map((r) => r.tablename)).toEqual([
          "AuditLog",
          "Session",
          "Space",
          "Testimonial",
          "User",
          "Workspace",
          "WorkspaceMember",
          "_prisma_migrations",
        ]);

        const checks = await fresh.query<{ conname: string }>(
          `SELECT conname FROM pg_constraint WHERE contype = 'c' ORDER BY conname`,
        );
        expect(checks.rows.map((r) => r.conname)).toEqual(
          expect.arrayContaining([
            "space_slug_lowercase",
            "testimonial_publish_guard",
            "testimonial_rating_range",
          ]),
        );

        const applied = await fresh.query<{ n: string; failed: string }>(
          `SELECT count(*) AS n, count(*) FILTER (WHERE finished_at IS NULL) AS failed
           FROM "_prisma_migrations"`,
        );
        const onDisk = readdirSync(migrationsDir, { withFileTypes: true }).filter((d) =>
          d.isDirectory(),
        ).length;
        expect(Number(applied.rows[0]?.n)).toBe(onDisk);
        expect(Number(applied.rows[0]?.failed)).toBe(0);
      } finally {
        await fresh.end();
      }
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin.end();
    }
  });
});
