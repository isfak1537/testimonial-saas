import { Link, Navigate, Route, Routes } from "react-router";
import { RequireAuth } from "../../auth/RequireAuth";
import CollectionTab from "./CollectionTab";
import { AppShell } from "./AppShell";
import NewSpacePage from "./NewSpacePage";
import SpaceLayout from "./SpaceLayout";
import SpaceSettingsPage from "./SpaceSettingsPage";
import SpacesListPage from "./SpacesListPage";
import { TabPlaceholder } from "./TabPlaceholder";
import "./app.css";

export default function AppSurface() {
  return (
    <RequireAuth>
      <AppShell>
        <Routes>
          <Route index element={<SpacesListPage />} />
          <Route path="spaces/new" element={<NewSpacePage />} />
          <Route path="spaces/:spaceId" element={<SpaceLayout />}>
            {/* Settings is the default tab until the Inbox exists (I07). */}
            <Route index element={<Navigate to="settings" replace />} />
            <Route path="inbox" element={<TabPlaceholder title="Inbox" />} />
            <Route path="collection" element={<CollectionTab />} />
            <Route path="wall" element={<TabPlaceholder title="Wall" />} />
            <Route path="embed" element={<TabPlaceholder title="Embed" />} />
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
