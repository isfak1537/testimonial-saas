import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { PublicWallDto, PublicWallItemDto } from "@testimonial-saas/shared";
import { api, ApiError } from "../../api/client";
import "./wall.css";

type Load =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "ready"; space: PublicWallDto["space"] };

/** Public Wall at /w/:slug (FR-WALL-06). Every value from the API is rendered as text. */
export default function WallSurface() {
  const { slug = "" } = useParams();
  // Keyed by slug so moving between Walls starts from a clean state.
  return <LoadedWall key={slug} slug={slug} />;
}

function LoadedWall({ slug }: { slug: string }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [items, setItems] = useState<PublicWallItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [more, setMore] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicWall(slug)
      .then((wall) => {
        if (cancelled) return;
        setItems(wall.testimonials);
        setNextCursor(wall.nextCursor);
        setLoad({ status: "ready", space: wall.space });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setLoad({ status: "missing" });
        else setLoad({ status: "error", message: e instanceof Error ? e.message : "Error" });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function loadMore() {
    if (!nextCursor || more.busy) return;
    setMore({ busy: true, error: null });
    try {
      const wall = await api.getPublicWall(slug, nextCursor);
      setItems((current) => [...current, ...wall.testimonials]);
      setNextCursor(wall.nextCursor);
      setMore({ busy: false, error: null });
    } catch (e: unknown) {
      setMore({ busy: false, error: e instanceof Error ? e.message : "Error" });
    }
  }

  if (load.status === "loading") {
    return (
      <main className="wall-page" data-testid="surface-wall">
        <p role="status">Loading…</p>
      </main>
    );
  }
  if (load.status === "missing") {
    return (
      <main className="wall-page" data-testid="surface-wall">
        <h1>This Wall is not available</h1>
        <p className="muted">The link may be wrong, or the Wall is no longer public.</p>
      </main>
    );
  }
  if (load.status === "error") {
    return (
      <main className="wall-page" data-testid="surface-wall">
        <h1>Something went wrong</h1>
        <p role="alert">{load.message}</p>
      </main>
    );
  }

  return (
    <main className="wall-page" data-testid="surface-wall">
      <header className="wall-header">
        <h1>{load.space.name}</h1>
        <p className="muted">{load.space.headline}</p>
      </header>
      {items.length === 0 ? (
        <p className="muted" data-testid="wall-empty">
          No testimonials yet.
        </p>
      ) : (
        <ul className="wall-grid" aria-label="Testimonials">
          {items.map((item) => (
            <li key={item.id} className="wall-card">
              <p className="wall-stars" role="img" aria-label={`${item.rating} out of 5`}>
                {"★".repeat(item.rating)}
                <span aria-hidden="true">{"☆".repeat(5 - item.rating)}</span>
              </p>
              <blockquote className="wall-content">{item.content}</blockquote>
              <p className="wall-author">
                <strong>{item.authorName}</strong>
                {item.authorTitle ? <span className="muted">{item.authorTitle}</span> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
      {more.error ? <p role="alert">{more.error}</p> : null}
      {nextCursor ? (
        <p className="wall-more">
          <button
            type="button"
            className="button button-secondary"
            disabled={more.busy}
            onClick={() => void loadMore()}
          >
            {more.busy ? "Loading…" : "Load more"}
          </button>
        </p>
      ) : null}
    </main>
  );
}
