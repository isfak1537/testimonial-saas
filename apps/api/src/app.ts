import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import type { Logger } from "pino";
import type { Config } from "./config.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { apiNotFound, errorHandler, fallbackErrorHandler } from "./http/error-handler.js";
import { health } from "./http/health.js";
import { originCheck } from "./http/origin-check.js";
import { authLimiter, submissionLimiter } from "./http/rate-limits.js";
import { jsonBody } from "./http/json-body.js";
import { requestId } from "./http/request-id.js";
import { requestLogger } from "./http/request-logger.js";
import { securityHeaders } from "./http/security-headers.js";
import { requireSession } from "./http/auth-context.js";
import { requireMember } from "./http/member-context.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { publicRoutes } from "./modules/public/public.routes.js";
import { createPublicService } from "./modules/public/public.service.js";
import { spacesRoutes } from "./modules/spaces/spaces.routes.js";
import { createSpacesService } from "./modules/spaces/spaces.service.js";
import * as members from "./modules/workspaces/members.repo.js";

export interface AppOptions {
  config: Pick<
    Config,
    | "WEB_DIST_DIR"
    | "WIDGET_DIST_DIR"
    | "APP_ORIGIN"
    | "SESSION_TTL_DAYS"
    | "AUTH_RATE_LIMIT_MAX"
    | "SUBMISSION_RATE_LIMIT_MAX"
  >;
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
  // SEC-02 runs before anything reads the body or the cookie.
  api.use(originCheck(config.APP_ORIGIN));
  api.use(jsonBody);
  api.use(cookieParser());
  api.get("/health", health(prisma, logger));
  // One limiter instance, mounted on sign-up and log-in, so they share the per-IP bucket.
  const auth = createAuthService(prisma, config);
  api.use("/auth", authRoutes(auth, config, authLimiter(config.AUTH_RATE_LIMIT_MAX)));
  // §3.2: one guard for everything under /workspaces/:workspaceId, so a new tenant router
  // cannot be mounted without a session and a verified OWNER membership.
  const tenant = express.Router({ mergeParams: true });
  tenant.use(
    requireSession(auth),
    requireMember(["OWNER"], (workspaceId, userId) =>
      members.findMembership(prisma, workspaceId, userId),
    ),
  );
  tenant.use("/spaces", spacesRoutes(createSpacesService(prisma)));
  api.use("/workspaces/:workspaceId", tenant);
  // Public, untenanted: the Space is found by its global slug, and every identifier on the stored
  // row comes from that lookup, never from the request.
  api.use(
    "/public",
    publicRoutes(createPublicService(prisma), submissionLimiter(config.SUBMISSION_RATE_LIMIT_MAX)),
  );
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
