/**
 * Released consent wordings (SRS FR-COL-08). Never edit an existing entry: add a new version
 * and point CURRENT_CONSENT_VERSION at it. consent.test.ts pins the SHA-256 of every text.
 */
export const CONSENT_TEMPLATES: Readonly<Record<string, string>> = {
  "2026-10-30.v1":
    "I agree that {Space name} may publish my name, title, rating and this testimonial on its website and marketing materials. I can ask {Space name} to remove it at any time.",
};

export const CURRENT_CONSENT_VERSION = "2026-10-30.v1";

/** The text a visitor sees. A function replacer keeps `$&` and friends in a Space name literal. */
export function renderConsentText(version: string, spaceName: string): string {
  const template = CONSENT_TEMPLATES[version];
  if (template === undefined) throw new Error(`Unknown consent version: ${version}`);
  return template.replaceAll("{Space name}", () => spaceName);
}
