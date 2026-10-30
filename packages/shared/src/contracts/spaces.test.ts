import { describe, expect, it } from "vitest";
import { createSpaceBody, listSpacesQuery, updateSpaceBody } from "./spaces.js";

const valid = { name: "Acme", slug: "acme", headline: "Hi" };

describe("createSpaceBody", () => {
  it("applies defaults and normalises", () => {
    expect(createSpaceBody.parse({ ...valid, slug: " ACME " })).toEqual({
      ...valid,
      message: "",
      prompts: [],
    });
  });

  it("rejects unknown keys", () => {
    expect(createSpaceBody.safeParse({ ...valid, workspaceId: "x" }).success).toBe(false);
  });
});

describe("updateSpaceBody", () => {
  it("needs at least one field and allows a partial", () => {
    expect(updateSpaceBody.safeParse({}).success).toBe(false);
    expect(updateSpaceBody.parse({ name: " New " })).toEqual({ name: "New" });
  });
});

describe("listSpacesQuery", () => {
  it("defaults, and reads includeArchived literally", () => {
    expect(listSpacesQuery.parse({})).toEqual({ limit: 20, includeArchived: false });
    expect(listSpacesQuery.parse({ includeArchived: "false" }).includeArchived).toBe(false);
    expect(listSpacesQuery.parse({ includeArchived: "true", limit: "50" })).toMatchObject({
      includeArchived: true,
      limit: 50,
    });
  });

  it("bounds the limit", () => {
    for (const limit of ["0", "51", "-1", "1.5", "x"]) {
      expect(listSpacesQuery.safeParse({ limit }).success).toBe(false);
    }
  });
});
