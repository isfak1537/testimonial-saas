import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSpace, createTestimonial, createUserWithWorkspace } from "../helpers/factories.js";
import { disconnectTestPrisma, testPrisma, truncateAll } from "../helpers/test-db.js";

const prisma = testPrisma();

beforeEach(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function seed() {
  const { workspace } = await createUserWithWorkspace(prisma);
  const space = await createSpace(prisma, workspace.id);
  return { workspace, space };
}

describe("testimonial_publish_guard (SRS §4.2)", () => {
  it("accepts a published row that is approved, consented and not deleted", async () => {
    const { workspace, space } = await seed();
    const row = await createTestimonial(prisma, workspace.id, space.id, {
      moderationStatus: "APPROVED",
      publishedAt: new Date(),
    });
    expect(row.publishedAt).toBeInstanceOf(Date);
  });

  it.each(["PENDING", "REJECTED"] as const)("rejects publishedAt on a %s row", async (status) => {
    const { workspace, space } = await seed();
    await expect(
      createTestimonial(prisma, workspace.id, space.id, {
        moderationStatus: status,
        publishedAt: new Date(),
      }),
    ).rejects.toThrow(/testimonial_publish_guard/);
  });

  it("rejects publishedAt on a withdrawn row and on a deleted row", async () => {
    const { workspace, space } = await seed();
    await expect(
      createTestimonial(prisma, workspace.id, space.id, {
        moderationStatus: "APPROVED",
        publishedAt: new Date(),
        consentWithdrawnAt: new Date(),
      }),
    ).rejects.toThrow(/testimonial_publish_guard/);
    await expect(
      createTestimonial(prisma, workspace.id, space.id, {
        moderationStatus: "APPROVED",
        publishedAt: new Date(),
        deletedAt: new Date(),
      }),
    ).rejects.toThrow(/testimonial_publish_guard/);
  });

  it("rejects a direct update that publishes a PENDING row", async () => {
    const { workspace, space } = await seed();
    const row = await createTestimonial(prisma, workspace.id, space.id);
    await expect(
      prisma.$executeRaw`UPDATE "Testimonial" SET "publishedAt" = now() WHERE id = ${row.id}::uuid`,
    ).rejects.toThrow(/testimonial_publish_guard/);
  });

  it("rejects a direct update that withdraws consent but keeps the row published", async () => {
    const { workspace, space } = await seed();
    const row = await createTestimonial(prisma, workspace.id, space.id, {
      moderationStatus: "APPROVED",
      publishedAt: new Date(),
    });
    await expect(
      prisma.$executeRaw`UPDATE "Testimonial" SET "consentWithdrawnAt" = now() WHERE id = ${row.id}::uuid`,
    ).rejects.toThrow(/testimonial_publish_guard/);
  });
});

describe("tenant composite foreign key", () => {
  it("rejects a testimonial whose workspaceId differs from its Space's workspace", async () => {
    const a = await seed();
    const { workspace: other } = await createUserWithWorkspace(prisma);
    await expect(createTestimonial(prisma, other.id, a.space.id)).rejects.toThrow(
      /Testimonial_spaceId_workspaceId_fkey|Foreign key constraint/i,
    );
    expect(await prisma.testimonial.count()).toBe(0);
  });

  it("accepts a testimonial in its own Space's workspace", async () => {
    const { workspace, space } = await seed();
    await createTestimonial(prisma, workspace.id, space.id);
    expect(await prisma.testimonial.count()).toBe(1);
  });
});

describe("space constraints", () => {
  it("rejects a duplicate slug, even across workspaces", async () => {
    const a = await seed();
    const { workspace: other } = await createUserWithWorkspace(prisma);
    await expect(createSpace(prisma, other.id, { slug: a.space.slug })).rejects.toThrow(
      /Unique constraint|slug/i,
    );
  });

  it("rejects a slug that is not lowercase", async () => {
    const { workspace } = await seed();
    await expect(createSpace(prisma, workspace.id, { slug: "My-Space" })).rejects.toThrow(
      /space_slug_lowercase/,
    );
  });
});

describe("testimonial rating", () => {
  it.each([0, 6])("rejects rating %i", async (rating) => {
    const { workspace, space } = await seed();
    await expect(createTestimonial(prisma, workspace.id, space.id, { rating })).rejects.toThrow(
      /testimonial_rating_range/,
    );
  });

  it.each([1, 5])("accepts rating %i", async (rating) => {
    const { workspace, space } = await seed();
    await createTestimonial(prisma, workspace.id, space.id, { rating });
  });
});

describe("referential actions", () => {
  it("refuses to delete a workspace that still has Spaces", async () => {
    const { workspace } = await seed();
    await expect(prisma.workspace.delete({ where: { id: workspace.id } })).rejects.toThrow();
  });

  it("cascades sessions when a user is deleted and keeps audit rows with a null actor", async () => {
    const { user, workspace } = await createUserWithWorkspace(prisma);
    await prisma.session.create({
      data: { tokenHash: "hash-1", userId: user.id, expiresAt: new Date(Date.now() + 1000) },
    });
    const audit = await prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "test.action",
        targetType: "Test",
        targetId: "1",
      },
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.session.count()).toBe(0);
    const kept = await prisma.auditLog.findUniqueOrThrow({ where: { id: audit.id } });
    expect(kept.actorUserId).toBeNull();
  });
});

describe("test helper truncateAll", () => {
  it("empties data tables but keeps the Prisma migration history", async () => {
    await seed();
    const before = await prisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM "_prisma_migrations"`;
    expect(Number(before[0]?.n)).toBeGreaterThan(0);

    await truncateAll(prisma);

    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.space.count()).toBe(0);
    const after = await prisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM "_prisma_migrations"`;
    expect(after[0]?.n).toBe(before[0]?.n);
  });
});
