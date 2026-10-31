import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { countPurgeTargets, purge } from "../../src/scripts/purge.js";
import { createSpace, createTestimonial, createUserWithWorkspace } from "../helpers/factories.js";
import { disconnectTestPrisma, testPrisma, truncateAll } from "../helpers/test-db.js";

const prisma = testPrisma();

// Fixed clock: nothing here reads the real time.
const NOW = new Date("2026-12-01T12:00:00.000Z");
const daysAgo = (days: number, extraMs = 0) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000 - extraMs);

let workspaceId: string;
let spaceId: string;
let userId: string;

beforeEach(async () => {
  await truncateAll(prisma);
  const { user, workspace } = await createUserWithWorkspace(prisma);
  userId = user.id;
  workspaceId = workspace.id;
  spaceId = (await createSpace(prisma, workspaceId)).id;
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function seed() {
  const old = await createTestimonial(prisma, workspaceId, spaceId, { deletedAt: daysAgo(31) });
  const justOver = await createTestimonial(prisma, workspaceId, spaceId, {
    deletedAt: daysAgo(30, 1),
  });
  const boundary = await createTestimonial(prisma, workspaceId, spaceId, {
    deletedAt: daysAgo(30),
  });
  const recent = await createTestimonial(prisma, workspaceId, spaceId, { deletedAt: daysAgo(29) });
  const live = await createTestimonial(prisma, workspaceId, spaceId);
  return { old, justOver, boundary, recent, live };
}

const idsLeft = async () =>
  (await prisma.testimonial.findMany({ select: { id: true } })).map((t) => t.id).sort();

describe("purge (FR-OPS-01)", () => {
  it("counts without deleting anything (dry-run)", async () => {
    const t = await seed();
    const counts = await countPurgeTargets(prisma, NOW);
    expect(counts.testimonials).toBe(2);
    expect(await idsLeft()).toEqual(
      [t.old.id, t.justOver.id, t.boundary.id, t.recent.id, t.live.id].sort(),
    );
  });

  it("deletes only testimonials deleted more than 30 days ago", async () => {
    const t = await seed();
    const result = await purge(prisma, NOW);
    expect(result.testimonials).toBe(2);
    // Exactly 30 days is kept; so are recent soft-deletes and live rows.
    expect(await idsLeft()).toEqual([t.boundary.id, t.recent.id, t.live.id].sort());
  });

  it("applies across tenants without touching live rows of another workspace", async () => {
    const other = await createUserWithWorkspace(prisma);
    const otherSpace = await createSpace(prisma, other.workspace.id);
    const otherLive = await createTestimonial(prisma, other.workspace.id, otherSpace.id);
    const otherOld = await createTestimonial(prisma, other.workspace.id, otherSpace.id, {
      deletedAt: daysAgo(90),
    });
    const t = await seed();
    await purge(prisma, NOW);
    const left = await idsLeft();
    expect(left).toContain(otherLive.id);
    expect(left).not.toContain(otherOld.id);
    expect(left).not.toContain(t.old.id);
  });

  it("keeps the audit trail", async () => {
    const t = await seed();
    await prisma.auditLog.create({
      data: {
        workspaceId,
        actorUserId: userId,
        action: "x",
        targetType: "testimonial",
        targetId: t.old.id,
      },
    });
    await purge(prisma, NOW);
    expect(await prisma.auditLog.count()).toBe(1);
  });

  it("deletes expired sessions only, in dry-run counts and on confirm", async () => {
    const mk = (tokenHash: string, expiresAt: Date) =>
      prisma.session.create({ data: { tokenHash, userId, expiresAt } });
    await mk("expired", new Date(NOW.getTime() - 1));
    await mk("expires-now", NOW);
    await mk("live", new Date(NOW.getTime() + 60_000));
    expect((await countPurgeTargets(prisma, NOW)).sessions).toBe(1);
    expect(await prisma.session.count()).toBe(3);
    expect((await purge(prisma, NOW)).sessions).toBe(1);
    const left = (await prisma.session.findMany()).map((s) => s.tokenHash).sort();
    expect(left).toEqual(["expires-now", "live"]);
  });
});
