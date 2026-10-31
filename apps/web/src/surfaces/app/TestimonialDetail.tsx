import type { TestimonialDto } from "@testimonial-saas/shared";

export type InboxAction =
  "approve" | "reject" | "publish" | "unpublish" | "withdraw-consent" | "delete";

interface TestimonialDetailProps {
  testimonial: TestimonialDto;
  spaceArchived: boolean;
  busy: boolean;
  onAction: (action: InboxAction) => void;
}

const fmt = (iso: string) => new Date(iso).toLocaleString();

/** Which actions the API will accept in this state (mirrors the service's transition table). */
export function availableActions(t: TestimonialDto, spaceArchived: boolean): InboxAction[] {
  const withdrawn = t.consentWithdrawnAt !== null;
  const actions: InboxAction[] = [];
  if (!spaceArchived) {
    if (t.moderationStatus !== "APPROVED" && !withdrawn) actions.push("approve");
    if (t.moderationStatus !== "REJECTED") actions.push("reject");
    if (t.moderationStatus === "APPROVED" && !withdrawn && !t.publishedAt) actions.push("publish");
    if (t.publishedAt) actions.push("unpublish");
  }
  if (!withdrawn) actions.push("withdraw-consent");
  actions.push("delete");
  return actions;
}

const LABELS: Record<InboxAction, string> = {
  approve: "Approve",
  reject: "Reject",
  publish: "Publish",
  unpublish: "Unpublish",
  "withdraw-consent": "Withdraw consent",
  delete: "Delete",
};

/** User text is only ever rendered as React text (SEC-05). */
export function TestimonialDetail({
  testimonial: t,
  spaceArchived,
  busy,
  onAction,
}: TestimonialDetailProps) {
  return (
    <section aria-labelledby="detail-title" className="inbox-detail">
      <h3 id="detail-title">{t.authorName}</h3>
      <dl>
        <dt>Title</dt>
        <dd>{t.authorTitle ?? "—"}</dd>
        <dt>Email (private)</dt>
        <dd>{t.authorEmail ?? "—"}</dd>
        <dt>Rating</dt>
        <dd>{t.rating} / 5</dd>
        <dt>Status</dt>
        <dd>{t.moderationStatus.toLowerCase()}</dd>
        <dt>Published</dt>
        <dd>{t.publishedAt ? fmt(t.publishedAt) : "No"}</dd>
        <dt>Consent given</dt>
        <dd>{fmt(t.consentGrantedAt)}</dd>
        <dt>Consent withdrawn</dt>
        <dd>{t.consentWithdrawnAt ? fmt(t.consentWithdrawnAt) : "No"}</dd>
        <dt>Received</dt>
        <dd>{fmt(t.createdAt)}</dd>
      </dl>
      <blockquote className="inbox-quote">{t.content}</blockquote>
      {spaceArchived ? (
        <p className="muted">
          This Space is archived: only withdraw consent and delete are available.
        </p>
      ) : null}
      <div className="form-actions">
        {availableActions(t, spaceArchived).map((action) => (
          <button
            key={action}
            type="button"
            className={`button ${action === "delete" || action === "withdraw-consent" ? "button-danger" : action === "publish" || action === "approve" ? "button-primary" : "button-secondary"}`}
            disabled={busy}
            onClick={() => onAction(action)}
          >
            {LABELS[action]}
          </button>
        ))}
      </div>
    </section>
  );
}
