import { useEffect, useState } from "react";
import { useOutletContext } from "react-router";
import type { TestimonialDto, TestimonialListItemDto } from "@testimonial-saas/shared";
import { api, ApiError } from "../../api/client";
import { useMe } from "../../auth/auth-context";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ConfirmDialog } from "./ConfirmDialog";
import type { SpaceContext } from "./SpaceLayout";
import { TestimonialDetail, type InboxAction } from "./TestimonialDetail";

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** FR-INB-01..08: filtered, paginated list, a detail panel and the moderation actions. */
export default function InboxTab() {
  const { space } = useOutletContext<SpaceContext>();
  const { workspace } = useMe();
  const [status, setStatus] = useState("");
  const [published, setPublished] = useState("");
  const [items, setItems] = useState<TestimonialListItemDto[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<TestimonialDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"withdraw-consent" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listTestimonials(workspace.id, space.id, { status, published })
      .then((page) => {
        if (cancelled) return;
        setError(null);
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setItems([]);
          setError(message(e, "Could not load testimonials."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.id, space.id, status, published]);

  /** A new filter starts a fresh list; reset here rather than in the effect that fetches it. */
  function changeFilter(set: (value: string) => void, value: string) {
    set(value);
    setItems(null);
    setSelected(null);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await api.listTestimonials(workspace.id, space.id, {
        status,
        published,
        cursor: nextCursor,
      });
      setItems((current) => [...(current ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(message(e, "Could not load more testimonials."));
    } finally {
      setLoadingMore(false);
    }
  }

  async function open(id: string) {
    setError(null);
    try {
      setSelected(await api.getTestimonial(workspace.id, space.id, id));
    } catch (e) {
      setError(message(e, "Could not load this testimonial."));
    }
  }

  async function run(action: InboxAction) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "delete") {
        await api.deleteTestimonial(workspace.id, space.id, selected.id);
        setItems((current) => current?.filter((i) => i.id !== selected.id) ?? null);
        setSelected(null);
      } else {
        const updated = await api.testimonialAction(workspace.id, space.id, selected.id, action);
        setSelected(updated);
        setItems(
          (current) =>
            current?.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)) ?? null,
        );
      }
    } catch (e) {
      setError(message(e, "That action failed."));
      // The row may have changed or vanished elsewhere; show what the server says now.
      if (e instanceof ApiError && (e.status === 404 || e.status === 409)) {
        void open(selected.id).catch(() => undefined);
      }
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  function onAction(action: InboxAction) {
    if (action === "delete" || action === "withdraw-consent") setConfirm(action);
    else void run(action);
  }

  return (
    <section aria-labelledby="tab-title">
      <h2 id="tab-title">Inbox</h2>
      <div className="inbox-filters">
        <div className="field">
          <label htmlFor="filter-status">Status</label>
          <select
            id="filter-status"
            value={status}
            onChange={(e) => changeFilter(setStatus, e.target.value)}
          >
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-published">Published</label>
          <select
            id="filter-published"
            value={published}
            onChange={(e) => changeFilter(setPublished, e.target.value)}
          >
            <option value="">All</option>
            <option value="true">Published</option>
            <option value="false">Not published</option>
          </select>
        </div>
      </div>
      <ErrorBanner message={error} />
      {items === null ? (
        <p role="status">Loading testimonials…</p>
      ) : items.length === 0 ? (
        <p className="muted" data-testid="inbox-empty">
          No testimonials match.
        </p>
      ) : (
        <div className="inbox-layout">
          <div>
            <ul className="inbox-list" aria-label="Testimonials">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="inbox-item"
                    aria-pressed={selected?.id === item.id}
                    onClick={() => void open(item.id)}
                  >
                    <strong>{item.authorName}</strong>
                    <span className="muted">
                      {" "}
                      · {item.rating}/5 · {item.moderationStatus.toLowerCase()}
                      {item.publishedAt ? " · published" : ""}
                      {item.consentWithdrawnAt ? " · consent withdrawn" : ""}
                    </span>
                    <span className="inbox-excerpt">{item.content}</span>
                  </button>
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
          </div>
          {selected ? (
            <TestimonialDetail
              testimonial={selected}
              spaceArchived={space.archivedAt !== null}
              busy={busy}
              onAction={onAction}
            />
          ) : (
            <p className="muted">Select a testimonial to review it.</p>
          )}
        </div>
      )}
      {confirm === "delete" ? (
        <ConfirmDialog
          title="Delete this testimonial?"
          confirmLabel="Delete"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void run("delete")}
        >
          <p>It is removed from the Inbox and the public page. This cannot be undone here.</p>
        </ConfirmDialog>
      ) : null}
      {confirm === "withdraw-consent" ? (
        <ConfirmDialog
          title="Withdraw consent?"
          confirmLabel="Withdraw consent"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void run("withdraw-consent")}
        >
          <p>
            The testimonial is unpublished and can never be published again. This cannot be undone.
          </p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
