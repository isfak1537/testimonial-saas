import { Link, Navigate, Route, Routes } from "react-router";
import { RequireAuth } from "../../auth/RequireAuth";
import CollectionTab from "./CollectionTab";
import InboxTab from "./InboxTab";
import { AppShell } from "./AppShell";
import NewSpacePage from "./NewSpacePage";
import SpaceLayout from "./SpaceLayout";
import SpaceSettingsPage from "./SpaceSettingsPage";
import SpacesListPage from "./SpacesListPage";
import EmbedTab from "./EmbedTab";
import WallTab from "./WallTab";
import "./app.css";

export default function AppSurface() {
  return (
    <RequireAuth>
      <AppShell>
        <Routes>
          <Route index element={<SpacesListPage />} />
          <Route path="spaces/new" element={<NewSpacePage />} />
          <Route path="spaces/:spaceId" element={<SpaceLayout />}>
            <Route index element={<Navigate to="inbox" replace />} />
            <Route path="inbox" element={<InboxTab />} />
            <Route path="collection" element={<CollectionTab />} />
            <Route path="wall" element={<WallTab />} />
            <Route path="embed" element={<EmbedTab />} />
            <Route path="settings" element={<SpaceSettingsPage />} />
          </Route>
          <Route
            path="*"
            element={
              <>
                <h1>Page not found</h1>
                <p>
                  <Link to="/app">Back to Spaces</Link>
                </p>
              </>
            }
          />
        </Routes>
      </AppShell>
    </RequireAuth>
  );
}
