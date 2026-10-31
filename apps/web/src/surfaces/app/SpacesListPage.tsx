import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { SpaceDto } from "@testimonial-saas/shared";
import { api } from "../../api/client";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useMe } from "../../auth/auth-context";

export default function SpacesListPage() {
  const { workspace } = useMe();
  const [items, setItems] = useState<SpaceDto[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listSpaces(workspace.id)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load Spaces.");
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.id]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await api.listSpaces(workspace.id, nextCursor);
      setItems((current) => [...(current ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more Spaces.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <h1>Spaces</h1>
        <Link to="spaces/new" className="button button-primary">
          New Space
        </Link>
      </div>
      <ErrorBanner message={error} />
      {items === null ? (
        error ? null : (
          <p role="status">Loading Spaces…</p>
        )
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="spaces-empty">
          <p>You have no Spaces yet. A Space collects testimonials for one product or brand.</p>
          <Link to="spaces/new" className="button button-primary">
            Create your first Space
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-list" aria-label="Your Spaces">
            {items.map((space) => (
              <li key={space.id} className="space-card">
                <h2>
                  <Link to={`spaces/${space.id}`}>{space.name}</Link>
                </h2>
                <p className="muted">/{space.slug}</p>
                <p>{space.headline}</p>
              </li>
            ))}
          </ul>
          {nextCursor ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
      )}
    </>
  );
}
