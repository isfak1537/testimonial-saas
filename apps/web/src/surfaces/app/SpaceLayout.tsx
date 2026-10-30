import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router";
import type { SpaceDto } from "@testimonial-saas/shared";
import { api, ApiError } from "../../api/client";
import { useMe } from "../../auth/auth-context";

export interface SpaceContext {
  space: SpaceDto;
  setSpace: (space: SpaceDto) => void;
}

type Load = { status: "loading" } | { status: "missing" } | { status: "error"; message: string };

const TABS = [
  ["inbox", "Inbox"],
  ["collection", "Collection"],
  ["wall", "Wall"],
  ["embed", "Embed"],
  ["settings", "Settings"],
] as const;

/** Keyed by id, so switching Spaces remounts with fresh loading state. */
export default function SpaceLayout() {
  const { spaceId = "" } = useParams();
  return <LoadedSpace key={spaceId} spaceId={spaceId} />;
}

function LoadedSpace({ spaceId }: { spaceId: string }) {
  const { workspace } = useMe();
  const [space, setSpace] = useState<SpaceDto | null>(null);
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    api
      .getSpace(workspace.id, spaceId)
      .then((found) => {
        if (!cancelled) setSpace(found);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setLoad({ status: "missing" });
        else setLoad({ status: "error", message: e instanceof Error ? e.message : "Error" });
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.id, spaceId]);

  if (!space) {
    if (load.status === "loading") return <p role="status">Loading Space…</p>;
    return (
      <>
        <h1>{load.status === "missing" ? "Space not found" : "Could not load this Space"}</h1>
        {load.status === "error" ? <p role="alert">{load.message}</p> : null}
        <p>
          <Link to="/app">Back to Spaces</Link>
        </p>
      </>
    );
  }

  const context: SpaceContext = { space, setSpace };
  return (
    <>
      <p>
        <Link to="/app">Back to Spaces</Link>
      </p>
      <h1>{space.name}</h1>
      {space.archivedAt ? (
        <p role="status" className="notice">
          This Space is archived and read-only.
        </p>
      ) : null}
      <nav aria-label="Space sections" className="tabs">
        <ul>
          {TABS.map(([path, label]) => (
            <li key={path}>
              <NavLink to={path}>{label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet context={context} />
    </>
  );
}
