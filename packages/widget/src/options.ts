// Pure parsing of the container's data attributes (FR-WID-05).

export type Theme = "light" | "dark";

export interface WidgetOptions {
  slug: string;
  theme: Theme;
  limit: number;
}

const DEFAULT_LIMIT = 12;

/** Integer 1–50, otherwise the default. */
export function parseLimit(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || !/^\d{1,3}$/.test(raw.trim())) return DEFAULT_LIMIT;
  const value = Number(raw);
  return value >= 1 && value <= 50 ? value : DEFAULT_LIMIT;
}

export function parseTheme(raw: string | null | undefined): Theme {
  return raw === "dark" ? "dark" : "light";
}

/** Returns null when the container names no Space, so there is nothing to fetch. */
export function readOptions(el: Pick<Element, "getAttribute">): WidgetOptions | null {
  const slug = (el.getAttribute("data-space") ?? "").trim();
  if (!slug) return null;
  return {
    slug,
    theme: parseTheme(el.getAttribute("data-theme")),
    limit: parseLimit(el.getAttribute("data-limit")),
  };
}
