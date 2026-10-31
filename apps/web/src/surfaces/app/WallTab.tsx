import { useOutletContext } from "react-router";
import type { SpaceContext } from "./SpaceLayout";

/** Links to the public Wall (FR-WALL-06). What shows on it is decided in the Inbox. */
export default function WallTab() {
  const { space } = useOutletContext<SpaceContext>();
  const path = `/w/${encodeURIComponent(space.slug)}`;

  return (
    <section aria-labelledby="tab-title">
      <h2 id="tab-title">Wall</h2>
      {space.archivedAt ? (
        <p className="muted">This Space is archived, so it has no public Wall.</p>
      ) : (
        <>
          <p className="muted">
            Your public Wall shows testimonials that are approved and published. Manage them in the
            Inbox.
          </p>
          <p>
            <a href={path} target="_blank" rel="noopener noreferrer">
              Open public page
            </a>
          </p>
        </>
      )}
    </section>
  );
}
