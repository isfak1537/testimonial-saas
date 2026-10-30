import { useState } from "react";
import { useOutletContext } from "react-router";
import type { SpaceContext } from "./SpaceLayout";

/** Shows the public collection link (FR-COL-01) with a copy button. */
export default function CollectionTab() {
  const { space } = useOutletContext<SpaceContext>();
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const link = `${window.location.origin}/c/${space.slug}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <section aria-labelledby="tab-title">
      <h2 id="tab-title">Collection</h2>
      {space.archivedAt ? (
        <p className="muted">This Space is archived, so its collection link no longer works.</p>
      ) : (
        <>
          <p className="muted">Send this link to customers to collect testimonials.</p>
          <div className="field">
            <label htmlFor="collection-link">Collection link</label>
            <input
              id="collection-link"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="button button-secondary" onClick={() => void copy()}>
              Copy link
            </button>
          </div>
          <p role="status" className="muted">
            {copied === "done" ? "Link copied." : null}
            {copied === "failed" ? "Could not copy. Select the link and copy it manually." : null}
          </p>
        </>
      )}
    </section>
  );
}
