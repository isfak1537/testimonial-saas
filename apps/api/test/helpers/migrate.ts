import { execFileSync } from "node:child_process";
import path from "node:path";

const apiDir = path.resolve(import.meta.dirname, "../..");

/** Runs `prisma migrate deploy` against `databaseUrl`; throws with Prisma's output on failure. */
export function migrateDeploy(databaseUrl: string): void {
  try {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `prisma migrate deploy failed. Is the test database up (pnpm db:test:up)?\n` +
        `${stdout?.toString() ?? ""}${stderr?.toString() ?? ""}`,
      { cause: error },
    );
  }
}
