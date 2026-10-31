// Fetches the public Wall (FR-WID-02). The response is untrusted: only the allowlisted keys
// survive, and anything of the wrong type makes the whole payload an error.

export interface WidgetItem {
  id: string;
  authorName: string;
  authorTitle: string | null;
  rating: number;
  content: string;
}

const TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseWall(payload: unknown): WidgetItem[] {
  if (!isRecord(payload) || !Array.isArray(payload["testimonials"])) {
    throw new Error("Unexpected Wall response");
  }
  return payload["testimonials"].map((raw: unknown): WidgetItem => {
    if (!isRecord(raw)) throw new Error("Unexpected Wall item");
    const { id, authorName, authorTitle, rating, content } = raw;
    if (
      typeof id !== "string" ||
      typeof authorName !== "string" ||
      typeof content !== "string" ||
      typeof rating !== "number" ||
      (authorTitle !== null && typeof authorTitle !== "string")
    ) {
      throw new Error("Unexpected Wall item");
    }
    return {
      id,
      authorName,
      authorTitle,
      rating: Math.min(5, Math.max(1, Math.round(rating))),
      content,
    };
  });
}

export async function fetchWall(
  origin: string,
  slug: string,
  limit: number,
): Promise<WidgetItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${origin}/api/v1/public/spaces/${encodeURIComponent(slug)}/wall?limit=${limit}`;
    const response = await fetch(url, {
      credentials: "omit",
      mode: "cors",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Wall request failed (${response.status})`);
    return parseWall(await response.json());
  } finally {
    clearTimeout(timer);
  }
}
