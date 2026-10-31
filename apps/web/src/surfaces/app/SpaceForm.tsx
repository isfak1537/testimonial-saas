import { useState, type FormEvent } from "react";
import { ErrorBanner } from "../../components/ErrorBanner";
import { FormField } from "../../components/FormField";
import { useErrorFocus } from "../../components/useErrorFocus";
import { formErrorsFrom, type FormErrors } from "../../api/errors";

export interface SpaceFormValues {
  name: string;
  slug: string;
  headline: string;
  message: string;
  prompts: string[];
}

interface SpaceFormProps {
  initial: SpaceFormValues;
  submitLabel: string;
  disabled?: boolean;
  /** Shown under the slug field when the slug differs from the saved one. */
  savedSlug?: string;
  onSubmit: (values: SpaceFormValues) => Promise<void>;
}

const FIELDS = ["name", "slug", "headline", "message", "prompts"] as const;
const MAX_PROMPTS = 5;

interface PromptRow {
  key: number;
  value: string;
}

let nextKey = 0;
const rowsFrom = (prompts: string[]): PromptRow[] =>
  prompts.map((value) => ({ key: nextKey++, value }));

export function SpaceForm({ initial, submitLabel, disabled, savedSlug, onSubmit }: SpaceFormProps) {
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [headline, setHeadline] = useState(initial.headline);
  const [message, setMessage] = useState(initial.message);
  const [prompts, setPrompts] = useState<PromptRow[]>(() => rowsFrom(initial.prompts));
  const [errors, setErrors] = useState<FormErrors>({ fields: {}, banner: null });
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { bannerRef, formRef } = useErrorFocus(attempt);

  const slugChanged = savedSlug !== undefined && slug.trim().toLowerCase() !== savedSlug;
  const promptsError = errors.fields["prompts"];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || disabled) return;
    setPending(true);
    setErrors({ fields: {}, banner: null });
    try {
      await onSubmit({
        name,
        slug,
        headline,
        message,
        prompts: prompts.map((row) => row.value).filter((value) => value.trim() !== ""),
      });
    } catch (error) {
      setErrors(formErrorsFrom(error, FIELDS));
      setAttempt((count) => count + 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ErrorBanner message={errors.banner} ref={bannerRef} />
      <form className="form" onSubmit={handleSubmit} noValidate ref={formRef}>
        <fieldset className="form-fieldset" disabled={disabled}>
          <FormField
            label="Name"
            name="name"
            required
            maxLength={80}
            value={name}
            onChange={setName}
            error={errors.fields["name"]}
          />
          <FormField
            label="Slug"
            name="slug"
            required
            maxLength={40}
            autoCapitalize="none"
            spellCheck={false}
            hint="Used in your public links. 3-40 lowercase letters, digits or hyphens."
            value={slug}
            onChange={setSlug}
            error={errors.fields["slug"]}
          />
          {slugChanged ? (
            <p role="status" className="notice">
              Changing the slug breaks existing links to this Space. Old links will stop working.
            </p>
          ) : null}
          <FormField
            label="Headline"
            name="headline"
            required
            maxLength={120}
            value={headline}
            onChange={setHeadline}
            error={errors.fields["headline"]}
          />
          <FormField
            label="Message"
            name="message"
            multiline
            maxLength={500}
            value={message}
            onChange={setMessage}
            error={errors.fields["message"]}
          />
          <div className="field" role="group" aria-labelledby="prompts-label">
            <p className="field-label" id="prompts-label">
              Prompts (up to {MAX_PROMPTS})
            </p>
            {prompts.map((row, index) => (
              <div className="prompt-row" key={row.key}>
                <input
                  aria-label={`Prompt ${index + 1}`}
                  aria-invalid={promptsError ? true : undefined}
                  maxLength={200}
                  value={row.value}
                  onChange={(event) =>
                    setPrompts((rows) =>
                      rows.map((r) =>
                        r.key === row.key ? { ...r, value: event.target.value } : r,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setPrompts((rows) => rows.filter((r) => r.key !== row.key))}
                >
                  Remove<span className="visually-hidden"> prompt {index + 1}</span>
                </button>
              </div>
            ))}
            {promptsError ? <p className="field-error">{promptsError}</p> : null}
            {prompts.length < MAX_PROMPTS ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setPrompts((rows) => [...rows, { key: nextKey++, value: "" }])}
              >
                Add prompt
              </button>
            ) : null}
          </div>
        </fieldset>
        {disabled ? null : (
          <div className="form-actions">
            <button type="submit" className="button button-primary" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </button>
          </div>
        )}
      </form>
    </>
  );
}
