import { Link, useNavigate } from "react-router";
import { api } from "../../api/client";
import { useMe } from "../../auth/auth-context";
import { SpaceForm } from "./SpaceForm";

export default function NewSpacePage() {
  const { workspace } = useMe();
  const navigate = useNavigate();
  return (
    <>
      <p>
        <Link to="/app">Back to Spaces</Link>
      </p>
      <h1>New Space</h1>
      <SpaceForm
        initial={{ name: "", slug: "", headline: "", message: "", prompts: [] }}
        submitLabel="Create Space"
        onSubmit={async (values) => {
          const space = await api.createSpace(workspace.id, values);
          void navigate(`/app/spaces/${space.id}/settings`);
        }}
      />
    </>
  );
}
