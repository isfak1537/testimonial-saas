import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import type { UpdateSpaceBody } from "@testimonial-saas/shared";
import { api } from "../../api/client";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useMe } from "../../auth/auth-context";
import type { SpaceContext } from "./SpaceLayout";
import { SpaceForm, type SpaceFormValues } from "./SpaceForm";

export default function SpaceSettingsPage() {
  const { workspace } = useMe();
  const { space, setSpace } = useOutletContext<SpaceContext>();
  const navigate = useNavigate();
  const [saved, setSaved] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const archived = space.archivedAt !== null;

  async function save(values: SpaceFormValues) {
    setSaved(null);
    const normalised = { ...values, slug: values.slug.trim().toLowerCase() };
    const body: UpdateSpaceBody = {};
    if (values.name.trim() !== space.name) body.name = values.name;
    if (normalised.slug !== space.slug) body.slug = values.slug;
    if (values.headline.trim() !== space.headline) body.headline = values.headline;
    if (values.message.trim() !== space.message) body.message = values.message;
    if (JSON.stringify(values.prompts.map((p) => p.trim())) !== JSON.stringify(space.prompts)) {
      body.prompts = values.prompts;
    }
    if (Object.keys(body).length === 0) {
      setSaved("Nothing to change.");
      return;
    }
    setSpace(await api.updateSpace(workspace.id, space.id, body));
    setSaved("Changes saved.");
  }

  async function archive() {
    if (archiving) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      await api.archiveSpace(workspace.id, space.id);
      void navigate("/app");
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : "Could not archive this Space.");
      setArchiving(false);
    }
  }

  return (
    <section aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>
      {saved ? (
        <p role="status" className="notice">
          {saved}
        </p>
      ) : null}
      <SpaceForm
        key={space.updatedAt}
        initial={{
          name: space.name,
          slug: space.slug,
          headline: space.headline,
          message: space.message,
          prompts: space.prompts,
        }}
        submitLabel="Save changes"
        disabled={archived}
        savedSlug={space.slug}
        onSubmit={save}
      />
      {archived ? null : (
        <div className="danger-zone">
          <h3>Archive this Space</h3>
          <p className="muted">
            Archived Spaces stop working on public pages, cannot be edited, and cannot be restored.
          </p>
          <ErrorBanner message={archiveError} />
          {confirming ? (
            <div className="form-actions">
              <button
                type="button"
                className="button button-danger"
                onClick={() => void archive()}
                disabled={archiving}
              >
                {archiving ? "Archiving…" : "Confirm archive"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setConfirming(false)}
                disabled={archiving}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setConfirming(true)}
            >
              Archive Space
            </button>
          )}
        </div>
      )}
    </section>
  );
}
