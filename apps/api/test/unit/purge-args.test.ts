import { describe, expect, it } from "vitest";
import { databaseName, parsePurgeArgs, testimonialCutoff } from "../../src/scripts/purge.js";

describe("parsePurgeArgs (FR-OPS-01)", () => {
  it("is a dry-run without arguments", () => {
    expect(parsePurgeArgs([])).toEqual({ confirm: false });
  });
  it("deletes only with the exact --confirm flag", () => {
    expect(parsePurgeArgs(["--confirm"])).toEqual({ confirm: true });
  });
  it.each([["--yes"], ["confirm"], ["--confirm=false"], ["--dry-run"]])("rejects %s", (arg) => {
    expect(() => parsePurgeArgs([arg!])).toThrow(/Unknown argument/);
  });
});

describe("databaseName", () => {
  it("returns the name only, never credentials or host", () => {
    const name = databaseName("postgresql://user:s3cret@db.internal:5432/testimonial?sslmode=x");
    expect(name).toBe("testimonial");
  });
  it("does not echo an unparseable URL", () => {
    expect(databaseName("not a url with s3cret")).toBe("(unknown)");
  });
});

describe("testimonialCutoff", () => {
  it("is exactly 30 days before now", () => {
    expect(testimonialCutoff(new Date("2026-11-30T12:00:00.000Z")).toISOString()).toBe(
      "2026-10-31T12:00:00.000Z",
    );
  });
});
