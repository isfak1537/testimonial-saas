import { describe, expect, it } from "vitest";
import { CONSENT_TEMPLATES, CURRENT_CONSENT_VERSION, renderConsentText } from "./consent.js";

// Released wordings are immutable: to change the text, add a new version, never edit one here.
const RELEASED_HASHES: Record<string, string> = {
  "2026-10-30.v1": "32d579a43f0e241a1e8370ff8a83f8f5412a819a6c1c139c1d5843235f5f0545",
};

// This package has no Node types (and must not gain a dependency for one test), so declare
// just the two globals the test uses; Node 24 provides both at runtime.
declare const crypto: { subtle: { digest(alg: string, data: Uint8Array): Promise<ArrayBuffer> } };
declare class TextEncoder {
  encode(text: string): Uint8Array;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("consent texts", () => {
  it("pins the SHA-256 of every released version", async () => {
    expect(Object.keys(CONSENT_TEMPLATES).sort()).toEqual(Object.keys(RELEASED_HASHES).sort());
    for (const [version, template] of Object.entries(CONSENT_TEMPLATES)) {
      expect(await sha256(template), version).toBe(RELEASED_HASHES[version]);
    }
  });

  it("has a template for the current version", () => {
    expect(CONSENT_TEMPLATES[CURRENT_CONSENT_VERSION]).toBeDefined();
  });

  it("renders the Space name everywhere, literally", () => {
    const text = renderConsentText(CURRENT_CONSENT_VERSION, "Acme $& {Space name}");
    expect(text.startsWith("I agree that Acme $& {Space name} may publish")).toBe(true);
    expect(text).toContain("ask Acme $& {Space name} to remove it");
  });

  it("rejects an unknown version", () => {
    expect(() => renderConsentText("nope", "Acme")).toThrow();
  });
});
