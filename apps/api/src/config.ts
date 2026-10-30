import path from "node:path";
import { z } from "zod";

const defaultWebDistDir = path.resolve(import.meta.dirname, "../../web/dist");
const defaultWidgetDistDir = path.resolve(import.meta.dirname, "../../../packages/widget/dist");

// Local default only; production must set APP_ORIGIN explicitly (see the refinement below).
const DEFAULT_APP_ORIGIN = "http://localhost:3000";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

function isHttpsOrLoopback(origin: string): boolean {
  const url = new URL(origin);
  return url.protocol === "https:" || LOOPBACK_HOSTS.has(url.hostname);
}

const originSchema = z.url().refine((value) => {
  if (!URL.canParse(value)) return false; // refinements also run after a failed `z.url()`
  const url = new URL(value);
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash &&
    !url.username
  );
}, "Must be an origin such as https://app.example.com (no path, query or credentials)");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.url().optional(),
    WEB_DIST_DIR: z.string().default(defaultWebDistDir),
    WIDGET_DIST_DIR: z.string().default(defaultWidgetDistDir),
    // The one browser origin of this environment: Origin check (SEC-02) and cookie `Secure` flag.
    APP_ORIGIN: originSchema.optional(),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    // Per IP and 15 minutes, for sign-up and log-in together. Raised only in test/E2E config.
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(10),
    // Per IP and 10 minutes, for public testimonial submissions (FR-COL-07). Raised only in test/E2E config.
    SUBMISSION_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(5),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.APP_ORIGIN !== undefined, {
    path: ["APP_ORIGIN"],
    message: "APP_ORIGIN is required when NODE_ENV=production",
  })
  // The session cookie is Secure only on https, so a plain-http production origin would send it
  // in clear text. Loopback hosts stay allowed so local Docker Compose and CI keep working.
  .refine(
    (env) => env.NODE_ENV !== "production" || !env.APP_ORIGIN || isHttpsOrLoopback(env.APP_ORIGIN),
    {
      path: ["APP_ORIGIN"],
      message:
        "APP_ORIGIN must be https in production (http is allowed only for localhost or 127.0.0.1)",
    },
  )
  .transform((env) => ({
    ...env,
    APP_ORIGIN: new URL(env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN).origin,
  }));

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
