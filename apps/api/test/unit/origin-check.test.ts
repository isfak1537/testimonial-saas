import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/http/errors.js";
import { originCheck } from "../../src/http/origin-check.js";

function run(method: string, origin?: string) {
  const next = vi.fn();
  const req = { method, headers: origin === undefined ? {} : { origin } } as unknown as Request;
  originCheck("https://app.example.com")(req, {} as Response, next);
  return next;
}

describe("originCheck (SEC-02)", () => {
  it("allows a matching Origin on POST", () => {
    expect(run("POST", "https://app.example.com")).toHaveBeenCalledWith();
  });

  it.each([
    ["missing", undefined],
    ["different host", "https://evil.example.com"],
    ["different scheme", "http://app.example.com"],
    ["different port", "https://app.example.com:8443"],
    ["null", "null"],
    ["trailing slash", "https://app.example.com/"],
  ])("rejects %s with 403 FORBIDDEN", (_name, origin) => {
    const error = run("POST", origin).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it.each(["PATCH", "PUT", "DELETE"])("checks %s too", (method) => {
    expect(run(method).mock.calls[0]?.[0]).toMatchObject({ status: 403 });
  });

  it.each(["GET", "HEAD", "OPTIONS"])("does not check %s", (method) => {
    expect(run(method)).toHaveBeenCalledWith();
  });
});
