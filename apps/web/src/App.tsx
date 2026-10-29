import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";

// Each public surface is its own chunk, so the landing page never loads dashboard,
// form or Wall code. Keep the route list in sync with SPA_ROUTES in apps/api/src/app.ts.
const LandingPage = lazy(() => import("./surfaces/landing/LandingPage"));
const AuthPage = lazy(() => import("./surfaces/auth/AuthPage"));
const AppSurface = lazy(() => import("./surfaces/app/AppSurface"));
const CollectSurface = lazy(() => import("./surfaces/collect/CollectSurface"));
const WallSurface = lazy(() => import("./surfaces/wall/WallSurface"));
const NotFoundPage = lazy(() => import("./surfaces/not-found/NotFoundPage"));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/app/*" element={<AppSurface />} />
          <Route path="/c/:slug" element={<CollectSurface />} />
          <Route path="/w/:slug" element={<WallSurface />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
