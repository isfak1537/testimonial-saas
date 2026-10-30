import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client.js";

type SpaceOverrides = Partial<{ slug: string; name: string; archivedAt: Date | null }>;
type TestimonialOverrides = Partial<{
  authorEmail: string | null;
  content: string;
  rating: number;
  moderationStatus: "PENDING" | "APPROVED" | "REJECTED";
  publishedAt: Date | null;
  consentWithdrawnAt: Date | null;
  deletedAt: Date | null;
}>;

/** A user with a workspace and an OWNER membership, as sign-up will create them. */
export async function createUserWithWorkspace(prisma: PrismaClient, label = randomUUID()) {
  const user = await prisma.user.create({
    data: {
      email: `${label}@example.test`,
      // Not a real hash: factories never log in. Auth tests create users through the API.
      passwordHash: "factory-placeholder",
      displayName: `User ${label.slice(0, 8)}`,
    },
  });
  const workspace = await prisma.workspace.create({ data: { name: `${label}'s workspace` } });
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
  });
  return { user, workspace };
}

export function createSpace(prisma: PrismaClient, workspaceId: string, o: SpaceOverrides = {}) {
  const slug = o.slug ?? `space-${randomUUID().slice(0, 8)}`;
  return prisma.space.create({
    data: {
      workspaceId,
      slug,
      name: o.name ?? "Test space",
      headline: "Tell us what you think",
      archivedAt: o.archivedAt ?? null,
    },
  });
}

export function createTestimonial(
  prisma: PrismaClient,
  workspaceId: string,
  spaceId: string,
  o: TestimonialOverrides = {},
) {
  return prisma.testimonial.create({
    data: {
      workspaceId,
      spaceId,
      authorName: "Ada Customer",
      authorEmail: o.authorEmail ?? null,
      rating: o.rating ?? 5,
      content: o.content ?? "Great product, would recommend.",
      moderationStatus: o.moderationStatus ?? "PENDING",
      publishedAt: o.publishedAt ?? null,
      consentVersion: "2026-10-30.v1",
      consentGrantedAt: new Date(),
      consentWithdrawnAt: o.consentWithdrawnAt ?? null,
      deletedAt: o.deletedAt ?? null,
    },
  });
}
