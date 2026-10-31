import { createPrisma } from "../db/client.js";
import { countPurgeTargets, databaseName, parsePurgeArgs, purge, RETENTION_DAYS } from "./purge.js";

/**
 * FR-OPS-01. `pnpm -F @testimonial-saas/api purge:deleted [--confirm]` (needs `pnpm build` first).
 * Prints the target database and the counts before it changes anything, in both modes.
 */
async function main(): Promise<void> {
  const { confirm } = parsePurgeArgs(process.argv.slice(2));
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const prisma = createPrisma(databaseUrl);
  try {
    const now = new Date();
    console.log(`Database: ${databaseName(databaseUrl)}`);
    console.log(`Mode: ${confirm ? "confirm (deleting)" : "dry-run (nothing is deleted)"}`);
    const counts = await countPurgeTargets(prisma, now);
    console.log(
      `Testimonials deleted more than ${RETENTION_DAYS} days ago: ${counts.testimonials}`,
    );
    console.log(`Expired sessions: ${counts.sessions}`);
    if (!confirm) {
      console.log("Run again with --confirm to delete them.");
      return;
    }
    const deleted = await purge(prisma, now);
    console.log(`Deleted ${deleted.testimonials} testimonials and ${deleted.sessions} sessions.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Argument and config errors are ours and safe to show; a database error text can name the
  // user or host, so it is reduced to its class.
  const ours =
    error instanceof Error && /^(Unknown argument|DATABASE_URL is required)/.test(error.message);
  console.error(
    ours ? (error as Error).message : "Purge failed (database error); nothing was changed.",
  );
  process.exitCode = 1;
});
