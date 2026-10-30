import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { formErrorsFrom } from "./errors";

const FIELDS = ["name", "slug", "prompts"] as const;

describe("formErrorsFrom", () => {
  it("maps detail paths to fields, using the first segment", () => {
    const error = new ApiError(422, "VALIDATION_FAILED", "Validation failed", [
      { path: "slug", message: "Reserved" },
      { path: "prompts.2", message: "Too long" },
    ]);
    expect(formErrorsFrom(error, FIELDS)).toEqual({
      fields: { slug: "Reserved", prompts: "Too long" },
      banner: null,
    });
  });

  it("keeps the first message per field", () => {
    const error = new ApiError(422, "VALIDATION_FAILED", "Validation failed", [
      { path: "name", message: "first" },
      { path: "name", message: "second" },
    ]);
    expect(formErrorsFrom(error, FIELDS).fields).toEqual({ name: "first" });
  });

  it("sends unknown paths to the banner", () => {
    const error = new ApiError(422, "VALIDATION_FAILED", "Validation failed", [
      { path: "slug", message: "Reserved" },
      { path: "", message: "Send at least one field" },
    ]);
    expect(formErrorsFrom(error, FIELDS)).toEqual({
      fields: { slug: "Reserved" },
      banner: "Validation failed: Send at least one field",
    });
  });

  it("uses the banner for errors without details", () => {
    const error = new ApiError(429, "RATE_LIMITED", "Too many requests");
    expect(formErrorsFrom(error, FIELDS)).toEqual({ fields: {}, banner: "Too many requests" });
  });

  it("uses a generic banner for non-API errors", () => {
    expect(formErrorsFrom(new Error("boom"), FIELDS).banner).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
