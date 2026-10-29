import path from "node:path";
import express from "express";

export interface AppOptions {
  webDistDir: string;
  widgetDistDir: string;
}

// Client-side routes served by the SPA. Anything else gets the SPA's
// not-found page with a real 404 status. Keep in sync with apps/web/src/router.tsx.
const SPA_ROUTES: readonly RegExp[] = [
  /^\/$/,
  /^\/login\/?$/,
  /^\/signup\/?$/,
  /^\/app(\/.*)?$/,
  /^\/c\/[^/]+\/?$/,
  /^\/w\/[^/]+\/?$/,
];

export function createApp({ webDistDir, widgetDistDir }: AppOptions): express.Express {
  const app = express();
  app.disable("x-powered-by");

  const api = express.Router();
  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/api/v1", api);

  // Placeholder JSON 404 for unknown API routes; the full error envelope arrives in I01.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  app.use("/embed", express.static(widgetDistDir, { index: false, maxAge: "5m" }), (_req, res) => {
    res.status(404).type("text/plain").send("Not found");
  });

  // Vite emits content-hashed file names under /assets, so they can be cached forever.
  app.use(
    "/assets",
    express.static(path.join(webDistDir, "assets"), {
      index: false,
      immutable: true,
      maxAge: "1y",
      fallthrough: false,
    }),
  );
  app.use(express.static(webDistDir, { index: false }));

  const indexHtml = path.join(webDistDir, "index.html");
  app.use((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    const isSpaRoute = SPA_ROUTES.some((route) => route.test(req.path));
    res.status(isSpaRoute ? 200 : 404).set("Cache-Control", "no-cache");
    res.sendFile(indexHtml, (error) => {
      if (error && !res.headersSent) {
        res.status(404).type("text/plain").send("Web app not built");
      }
    });
  });

  return app;
}
