import { describe, expect, it } from "vitest";
import { toPublicWall, toPublicWallItem } from "../../src/modules/public/public.mappers.js";

const row = {
  id: "00000000-0000-4000-8000-000000000001",
  authorName: "Ada",
  authorTitle: null,
  rating: 4,
  content: "Nice",
  publishedAt: new Date("2026-10-30T12:00:00.000Z"),
};

describe("toPublicWallItem (SEC-06)", () => {
  it("emits exactly the allowlisted keys", () => {
    expect(Object.keys(toPublicWallItem(row)).sort()).toEqual([
      "authorName",
      "authorTitle",
      "content",
      "id",
      "publishedAt",
      "rating",
    ]);
    expect(toPublicWallItem(row).publishedAt).toBe("2026-10-30T12:00:00.000Z");
  });

  it("drops anything else on the row", () => {
    const dirty = {
      ...row,
      authorEmail: "a@example.com",
      workspaceId: "w",
      spaceId: "s",
      moderationStatus: "APPROVED",
      consentVersion: "v",
      consentWithdrawnAt: null,
      deletedAt: null,
    };
    const text = JSON.stringify(toPublicWallItem(dirty));
    for (const word of ["a@example.com", "workspaceId", "spaceId", "moderationStatus", "consent"]) {
      expect(text).not.toContain(word);
    }
  });
});

describe("toPublicWall", () => {
  it("keeps only the Space name and headline", () => {
    const wall = toPublicWall(
      { name: "Acme", headline: "Hi", ...{ id: "x", workspaceId: "w", slug: "acme" } },
      [row],
      "next",
    );
    expect(wall).toEqual({
      space: { name: "Acme", headline: "Hi" },
      testimonials: [toPublicWallItem(row)],
      nextCursor: "next",
    });
  });
});
