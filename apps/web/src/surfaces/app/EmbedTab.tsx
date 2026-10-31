import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router";
import type { SpaceContext } from "./SpaceLayout";

const DEFAULT_LIMIT = 12;

/** FR-WID-01. `data-limit` is emitted only when it differs from the widget's default. */
export function embedSnippet(origin: string, slug: string, theme: string, limit: number): string {
  // Server validation allows only these characters; refuse to build a snippet from anything else.
  if (!/^[a-z0-9-]+$/.test(slug)) return "";
  const limitAttr = limit === DEFAULT_LIMIT ? "" : ` data-limit="${limit}"`;
  return [
    `<div data-testimonial-widget data-space="${slug}" data-theme="${theme}"${limitAttr}></div>`,
    `<script async src="${origin}/embed/widget.v1.js"></script>`,
  ].join("\n");
}

/** Mounts the real widget script into a fresh container; remounted when the options change. */
function Preview({ slug, theme, limit }: { slug: string; theme: string; limit: number }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = host.current;
    if (!target) return;
    const container = document.createElement("div");
    container.setAttribute("data-testimonial-widget", "");
    container.setAttribute("data-space", slug);
    container.setAttribute("data-theme", theme);
    container.setAttribute("data-limit", String(limit));
    const script = document.createElement("script");
    script.src = "/embed/widget.v1.js";
    target.append(container, script);
    return () => {
      container.remove();
      script.remove();
    };
  }, [slug, theme, limit]);

  return <div ref={host} data-testid="embed-preview" />;
}

/** Embed snippet with copy button and live preview (FR-WID-07). */
export default function EmbedTab() {
  const { space } = useOutletContext<SpaceContext>();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [limitText, setLimitText] = useState(String(DEFAULT_LIMIT));
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  const parsed = Number(limitText);
  const limitValid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 50;
  const limit = limitValid ? parsed : DEFAULT_LIMIT;
  const snippet = embedSnippet(window.location.origin, space.slug, theme, limit);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <section aria-labelledby="tab-title">
      <h2 id="tab-title">Embed</h2>
      {space.archivedAt ? (
        <p className="muted">This Space is archived, so it has no public Wall to embed.</p>
      ) : (
        <>
          <p className="muted">
            Paste this snippet into any web page to show your published testimonials.
          </p>
          <div className="field">
            <label htmlFor="embed-theme">Theme</label>
            <select
              id="embed-theme"
              value={theme}
              onChange={(event) => setTheme(event.target.value === "dark" ? "dark" : "light")}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="embed-limit">Number of testimonials (1–50)</label>
            <input
              id="embed-limit"
              type="number"
              min={1}
              max={50}
              value={limitText}
              onChange={(event) => setLimitText(event.target.value)}
              aria-invalid={!limitValid}
            />
            {limitValid ? null : (
              <p className="muted">Enter a whole number from 1 to 50; {DEFAULT_LIMIT} is used.</p>
            )}
          </div>
          <div className="field">
            <label htmlFor="embed-snippet">Embed snippet</label>
            <textarea
              id="embed-snippet"
              className="embed-snippet"
              readOnly
              rows={3}
              value={snippet}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="button button-secondary" onClick={() => void copy()}>
              Copy snippet
            </button>
          </div>
          <p role="status" className="muted">
            {copied === "done" ? "Snippet copied." : null}
            {copied === "failed"
              ? "Could not copy. Select the snippet and copy it manually."
              : null}
          </p>
          <h3>Preview</h3>
          <Preview slug={space.slug} theme={theme} limit={limit} />
        </>
      )}
    </section>
  );
}
