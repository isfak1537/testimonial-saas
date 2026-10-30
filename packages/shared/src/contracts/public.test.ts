import { describe, expect, it } from "vitest";
import { submitTestimonialBody } from "./public.js";

const valid = {
  authorName: "Ada",
  rating: 5,
  content: "Great product, would recommend.",
  consent: true,
  consentVersion: "2026-10-30.v1",
};

const fails = (body: unknown) => !submitTestimonialBody.safeParse(body).success;

describe("submitTestimonialBody", () => {
  it("accepts a minimal body and trims text", () => {
    const parsed = submitTestimonialBody.parse({
      ...valid,
      authorName: "  Ada ",
      content: "   ten chars!!   ",
      authorEmail: " Ada@Example.COM ",
    });
    expect(parsed).toMatchObject({
      authorName: "Ada",
      content: "ten chars!!",
      authorEmail: "ada@example.com",
    });
  });

  it("rejects bad consent, rating and content", () => {
    expect(fails({ ...valid, consent: false })).toBe(true);
    expect(fails({ ...valid, consent: "true" })).toBe(true);
    expect(fails({ ...valid, consent: undefined })).toBe(true);
    for (const rating of [0, 6, 3.5, "5", null]) expect(fails({ ...valid, rating })).toBe(true);
    expect(fails({ ...valid, content: "123456789" })).toBe(true);
    expect(fails({ ...valid, content: "  123456789   " })).toBe(true);
    expect(fails({ ...valid, content: "x".repeat(2001) })).toBe(true);
    expect(fails({ ...valid, content: "x".repeat(2000) })).toBe(false);
  });

  it("bounds the other fields", () => {
    expect(fails({ ...valid, authorName: "" })).toBe(true);
    expect(fails({ ...valid, authorName: "x".repeat(81) })).toBe(true);
    expect(fails({ ...valid, authorTitle: "x".repeat(121) })).toBe(true);
    expect(fails({ ...valid, authorEmail: "nope" })).toBe(true);
    expect(fails({ ...valid, authorEmail: `${"a".repeat(250)}@b.co` })).toBe(true);
    expect(fails({ ...valid, authorEmail: "" })).toBe(true);
    expect(fails({ ...valid, website: "x".repeat(201) })).toBe(true);
  });

  it("rejects unknown and server-owned keys", () => {
    for (const key of [
      "extra",
      "workspaceId",
      "spaceId",
      "id",
      "moderationStatus",
      "publishedAt",
      "consentGrantedAt",
    ]) {
      expect(fails({ ...valid, [key]: "x" }), key).toBe(true);
    }
  });
});
