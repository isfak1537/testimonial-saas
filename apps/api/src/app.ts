import path from "node:path";
import express from "express";
import type { Logger } from "pino";
import type { Config } from "./config.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { apiNotFound, errorHandler, fallbackErrorHandler } from "./http/error-handler.js";
import { health } from "./http/health.js";
import { jsonBody } from "./http/json-body.js";
import { requestId } from "./http/request-id.js";
import { requestLogger } from "./http/request-logger.js";
import { securityHeaders } from "./http/security-headers.js";

export interface AppOptions {
  config: Pick<Config, "WEB_DIST_DIR" | "WIDGET_DIST_DIR">;
  logger: Logger;
  prisma: PrismaClient;
  /** Lets tests mount extra routes on `/api/v1`; production code passes nothing. */
  registerRoutes?: (api: express.Router) => void;
}

// Client-side routes served by the SPA. Anything else gets the SPA's
// not-found page with a real 404 status. Keep in sync with apps/web/src/App.tsx.
const SPA_ROUTES: readonly RegExp[] = [
  /^\/$/,
  /^\/login\/?$/,
  /^\/signup\/?$/,
  /^\/app(\/.*)?$/,
  /^\/c\/[^/]+\/?$/,
  /^\/w\/[^/]+\/?$/,
];

export function createApp({ config, logger, prisma, registerRoutes }: AppOptions): express.Express {
  const webDistDir = config.WEB_DIST_DIR;
  const widgetDistDir = config.WIDGET_DIST_DIR;
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId, securityHeaders, requestLogger(logger));

  const api = express.Router();
  // Authenticated JSON must not be cached by proxies; the public Wall will override per FR-WALL-04.
  api.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  api.use(jsonBody);
  api.get("/health", health(prisma, logger));
  registerRoutes?.(api);
  app.use("/api/v1", api);

  // Unknown API routes and every error thrown under /api get the JSON envelope.
  app.use("/api", apiNotFound, errorHandler(logger));

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

  app.use(fallbackErrorHandler(logger));

  return app;
}
