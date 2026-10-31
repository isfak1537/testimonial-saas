import { ApiError } from "./client";

export interface FormErrors {
  /** Messages for known fields, keyed by field name. */
  fields: Record<string, string>;
  /** Message for everything that belongs to no field; shown in the banner. */
  banner: string | null;
}

/**
 * Splits an error into per-field messages and a banner message. A detail path such as
 * `prompts.2` belongs to the field `prompts`. Details whose path matches no field on the form
 * fall back to the banner, as does every error without details (429, 5xx, network).
 */
export function formErrorsFrom(error: unknown, knownFields: readonly string[]): FormErrors {
  if (!(error instanceof ApiError)) {
    return { fields: {}, banner: "Something went wrong. Please try again." };
  }
  const fields: Record<string, string> = {};
  const unmapped: string[] = [];
  for (const detail of error.details) {
    const field = detail.path.split(".")[0] ?? "";
    if (knownFields.includes(field)) {
      fields[field] ??= detail.message;
    } else {
      unmapped.push(detail.message);
    }
  }
  if (Object.keys(fields).length > 0 && unmapped.length === 0) {
    return { fields, banner: null };
  }
  const banner = unmapped.length > 0 ? `${error.message}: ${unmapped.join("; ")}` : error.message;
  return { fields, banner };
}
