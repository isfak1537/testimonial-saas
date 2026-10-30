import { RESERVED_SLUGS, slug } from "@testimonial-saas/shared";
import { describe, expect, it } from "vitest";

describe("slug (FR-SPACE-02, 03)", () => {
  it("trims and lowercases before validating", () => {
    expect(slug.parse("  My-Space1 ")).toBe("my-space1");
  });

  it.each(["abc", "a-b", "a".repeat(40), "a1-b2-c3"])("accepts %s", (value) => {
    expect(slug.safeParse(value).success).toBe(true);
  });

  it.each(["ab", "a".repeat(41), "-abc", "abc-", "a_b", "a b", "ünï", "", "a.b"])(
    "rejects %j",
    (value) => {
      expect(slug.safeParse(value).success).toBe(false);
    },
  );

  it.each(RESERVED_SLUGS.filter((s) => s.length >= 3))("rejects reserved %s in any case", (s) => {
    expect(slug.safeParse(s).success).toBe(false);
    expect(slug.safeParse(s.toUpperCase()).success).toBe(false);
  });

  it("lists every reserved word of FR-SPACE-03", () => {
    expect([...RESERVED_SLUGS].sort()).toEqual(
      "admin api app assets c embed help login logout signup support w www".split(" ").sort(),
    );
  });
});
