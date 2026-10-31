import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWall } from "./api.js";
import { parseLimit, parseTheme, readOptions } from "./options.js";
import { stars } from "./render.js";

const item = {
  id: "t1",
  authorName: "Grace",
  authorTitle: null,
  rating: 5,
  content: "Great",
  publishedAt: "2026-10-30T12:00:00.000Z",
};

describe("options (FR-WID-05)", () => {
  it("defaults the theme to light and accepts only light or dark", () => {
    expect(parseTheme(null)).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("DARK")).toBe("light");
    expect(parseTheme("<b>")).toBe("light");
  });

  it.each([
    [null, 12],
    ["", 12],
    ["1", 1],
    ["50", 50],
    ["0", 12],
    ["51", 12],
    ["-3", 12],
    ["2.5", 12],
    ["abc", 12],
    ["1e1", 12],
  ])("limit %j → %i", (raw, expected) => {
    expect(parseLimit(raw)).toBe(expected);
  });

  it("returns null without a slug", () => {
    const attrs = (map: Record<string, string>) => ({
      getAttribute: (n: string) => map[n] ?? null,
    });
    expect(readOptions(attrs({}))).toBeNull();
    expect(readOptions(attrs({ "data-space": "  " }))).toBeNull();
    expect(readOptions(attrs({ "data-space": "acme", "data-theme": "dark" }))).toEqual({
      slug: "acme",
      theme: "dark",
      limit: 12,
    });
  });
});

describe("parseWall (untrusted response)", () => {
  it("keeps only the allowlisted keys", () => {
    const parsed = parseWall({
      testimonials: [{ ...item, authorEmail: "a@b.c", workspaceId: "w", consentVersion: 1 }],
    });
    expect(parsed).toEqual([
      { id: "t1", authorName: "Grace", authorTitle: null, rating: 5, content: "Great" },
    ]);
    expect(Object.keys(parsed[0]!).sort()).toEqual(
      ["authorName", "authorTitle", "content", "id", "rating"].sort(),
    );
  });

  it("clamps the rating", () => {
    expect(parseWall({ testimonials: [{ ...item, rating: 99 }] })[0]!.rating).toBe(5);
    expect(parseWall({ testimonials: [{ ...item, rating: -2 }] })[0]!.rating).toBe(1);
  });

  it.each([
    ["null", null],
    ["no list", {}],
    ["string item", { testimonials: ["x"] }],
    ["numeric name", { testimonials: [{ ...item, authorName: 7 }] }],
    ["string rating", { testimonials: [{ ...item, rating: "5" }] }],
    ["object content", { testimonials: [{ ...item, content: {} }] }],
  ])("rejects %s", (_n, payload) => {
    expect(() => parseWall(payload)).toThrow();
  });
});

describe("stars", () => {
  it("renders N filled and 5-N empty", () => {
    expect(stars(3)).toBe("★★★☆☆");
  });
});

describe("no HTML sinks (FR-WID-03, SEC-05)", () => {
  const dir = new URL(".", import.meta.url);
  const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it("has source files to check", () => {
    expect(sources.length).toBeGreaterThan(3);
  });

  it.each(sources)("%s uses none of the HTML-parsing APIs", (file) => {
    const code = readFileSync(new URL(file, dir), "utf8");
    expect(code).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|createContextualFragment|DOMParser/,
    );
  });

  it("does not import packages/shared at runtime", () => {
    for (const file of sources) {
      expect(readFileSync(new URL(file, dir), "utf8")).not.toMatch(/@testimonial-saas\/shared/);
    }
  });
});
