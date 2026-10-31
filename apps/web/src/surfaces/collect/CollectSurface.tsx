import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import type { PublicFormDto, SubmitTestimonialBody } from "@testimonial-saas/shared";
import { api, ApiError } from "../../api/client";
import { formErrorsFrom, type FormErrors } from "../../api/errors";
import { ErrorBanner } from "../../components/ErrorBanner";
import { FormField } from "../../components/FormField";
import { useErrorFocus } from "../../components/useErrorFocus";
import "./collect.css";

type Load =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "ready"; form: PublicFormDto };

const FIELDS = [
  "authorName",
  "authorTitle",
  "authorEmail",
  "rating",
  "content",
  "consent",
] as const;

/** Public testimonial form at /c/:slug (FR-COL-01..07). Everything shown is rendered as text. */
export default function CollectSurface() {
  const { slug = "" } = useParams();
  // Keyed by slug so moving between forms starts from a clean state.
  return <LoadedForm key={slug} slug={slug} />;
}

function LoadedForm({ slug }: { slug: string }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicForm(slug)
      .then((form) => {
        if (!cancelled) setLoad({ status: "ready", form });
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

  if (load.status === "loading") {
    return (
      <main className="collect-page" data-testid="surface-collect">
        <div className="collect-card">
          <p role="status">Loading…</p>
        </div>
      </main>
    );
  }
  if (load.status === "missing") {
    return (
      <main className="collect-page" data-testid="surface-collect">
        <div className="collect-card">
          <h1>This form is not available</h1>
          <p className="muted">The link may be wrong, or the form is no longer collecting.</p>
        </div>
      </main>
    );
  }
  if (load.status === "error") {
    return (
      <main className="collect-page" data-testid="surface-collect">
        <div className="collect-card">
          <h1>Something went wrong</h1>
          <p role="alert">{load.message}</p>
        </div>
      </main>
    );
  }
  return <Form slug={slug} form={load.form} />;
}

function Form({ slug, form }: { slug: string; form: PublicFormDto }) {
  const [authorName, setAuthorName] = useState("");
  const [authorTitle, setAuthorTitle] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<FormErrors>({ fields: {}, banner: null });
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { bannerRef, formRef } = useErrorFocus(attempt);

  if (done) {
    return (
      <main className="collect-page" data-testid="surface-collect">
        <div className="collect-card" data-testid="collect-thanks">
          <h1>Thank you!</h1>
          <p>
            Your testimonial for {form.name} was sent. It will be reviewed before anything is shown.
          </p>
        </div>
      </main>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setErrors({ fields: {}, banner: null });
    const body: Record<string, unknown> = {
      authorName,
      rating,
      content,
      consent,
      consentVersion: form.consent.version,
    };
    if (authorTitle.trim()) body["authorTitle"] = authorTitle;
    if (authorEmail.trim()) body["authorEmail"] = authorEmail;
    if (website) body["website"] = website;
    try {
      await api.submitTestimonial(slug, body as unknown as SubmitTestimonialBody);
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === "CONSENT_VERSION_OUTDATED") {
        setErrors({
          fields: {},
          banner: "The consent text has changed. Please reload this page, then submit again.",
        });
      } else if (error instanceof ApiError && error.code === "RATE_LIMITED") {
        setErrors({ fields: {}, banner: "Too many submissions. Please try again later." });
      } else {
        setErrors(formErrorsFrom(error, FIELDS));
      }
      setAttempt((count) => count + 1);
    } finally {
      setPending(false);
    }
  }

  const ratingError = errors.fields["rating"];
  const consentError = errors.fields["consent"];
  return (
    <main className="collect-page" data-testid="surface-collect">
      <div className="collect-card">
        <h1>{form.headline}</h1>
        {form.message ? <p className="muted">{form.message}</p> : null}
        {form.prompts.length > 0 ? (
          <ul className="collect-prompts" aria-label="Ideas for what to write">
            {form.prompts.map((prompt, index) => (
              <li key={index}>{prompt}</li>
            ))}
          </ul>
        ) : null}
        <ErrorBanner message={errors.banner} ref={bannerRef} />
        <form className="form" onSubmit={handleSubmit} noValidate ref={formRef}>
          <FormField
            label="Your name"
            name="authorName"
            required
            maxLength={80}
            autoComplete="name"
            value={authorName}
            onChange={setAuthorName}
            error={errors.fields["authorName"]}
          />
          <FormField
            label="Your title (optional)"
            name="authorTitle"
            maxLength={120}
            autoComplete="organization-title"
            value={authorTitle}
            onChange={setAuthorTitle}
            error={errors.fields["authorTitle"]}
          />
          <FormField
            label="Email (optional)"
            name="authorEmail"
            type="email"
            maxLength={254}
            autoComplete="email"
            hint="Never shown publicly."
            value={authorEmail}
            onChange={setAuthorEmail}
            error={errors.fields["authorEmail"]}
          />
          <fieldset className="collect-fieldset field">
            <legend>Rating</legend>
            <div className="rating-options">
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value} className="rating-option">
                  <input
                    type="radio"
                    name="rating"
                    value={value}
                    checked={rating === value}
                    aria-invalid={ratingError ? true : undefined}
                    aria-describedby={ratingError ? "rating-error" : undefined}
                    onChange={() => setRating(value)}
                  />
                  {value}
                  <span className="visually-hidden"> out of 5</span>
                </label>
              ))}
            </div>
            {ratingError ? (
              <p id="rating-error" className="field-error">
                {ratingError}
              </p>
            ) : null}
          </fieldset>
          <FormField
            label="Your testimonial"
            name="content"
            multiline
            required
            maxLength={2000}
            hint="At least 10 characters."
            value={content}
            onChange={setContent}
            error={errors.fields["content"]}
          />
          <div className="field">
            <div className="consent-row">
              <input
                id="consent"
                type="checkbox"
                checked={consent}
                aria-invalid={consentError ? true : undefined}
                aria-describedby={consentError ? "consent-error" : undefined}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <label htmlFor="consent">{form.consent.text}</label>
            </div>
            {consentError ? (
              <p id="consent-error" className="field-error">
                {consentError}
              </p>
            ) : null}
          </div>
          {/* Honeypot: people never see or reach this field (FR-COL-04). */}
          <div className="hp-field" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input
              id="website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>
          <div className="collect-actions">
            <button type="submit" className="button button-primary" disabled={pending}>
              {pending ? "Sending…" : "Send testimonial"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
