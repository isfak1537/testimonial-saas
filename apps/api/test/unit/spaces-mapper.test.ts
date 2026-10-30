import { describe, expect, it } from "vitest";
import { toSpace } from "../../src/modules/spaces/spaces.mappers.js";

describe("toSpace", () => {
  const base = {
    id: "id",
    name: "n",
    slug: "slug",
    headline: "h",
    message: "",
    archivedAt: null,
    createdAt: new Date("2026-10-30T00:00:00Z"),
    updatedAt: new Date("2026-10-30T00:00:00Z"),
  };

  it("returns [] for null prompts", () => {
    expect(toSpace({ ...base, prompts: null }).prompts).toEqual([]);
  });

  it("exposes only the allowlisted fields", () => {
    const row = { ...base, prompts: ["a"], workspaceId: "secret" };
    expect(Object.keys(toSpace(row)).sort()).toEqual(
      [
        "archivedAt",
        "createdAt",
        "headline",
        "id",
        "message",
        "name",
        "prompts",
        "slug",
        "updatedAt",
      ].sort(),
    );
  });
});
