import { describe, expect, it } from "vitest";
import { listTestimonialsQuery, testimonialActionBody } from "./testimonials.js";

describe("listTestimonialsQuery", () => {
  it("defaults, and reads published literally", () => {
    expect(listTestimonialsQuery.parse({})).toEqual({ limit: 20 });
    expect(listTestimonialsQuery.parse({ published: "false" }).published).toBe(false);
    expect(listTestimonialsQuery.parse({ published: "true", status: "APPROVED" })).toEqual({
      limit: 20,
      published: true,
      status: "APPROVED",
    });
  });

  it("rejects unknown values and keys", () => {
    expect(listTestimonialsQuery.safeParse({ status: "approved" }).success).toBe(false);
    expect(listTestimonialsQuery.safeParse({ published: "1" }).success).toBe(false);
    expect(listTestimonialsQuery.safeParse({ includeDeleted: "true" }).success).toBe(false);
  });
});

describe("testimonialActionBody", () => {
  it("accepts no body or an empty object, and nothing else", () => {
    expect(testimonialActionBody.safeParse(undefined).success).toBe(true);
    expect(testimonialActionBody.safeParse({}).success).toBe(true);
    for (const key of ["moderationStatus", "publishedAt", "workspaceId", "authorName"]) {
      expect(testimonialActionBody.safeParse({ [key]: "x" }).success).toBe(false);
    }
  });
});
