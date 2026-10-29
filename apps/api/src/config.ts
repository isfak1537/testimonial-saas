import path from "node:path";
import { z } from "zod";

const defaultWebDistDir = path.resolve(import.meta.dirname, "../../web/dist");
const defaultWidgetDistDir = path.resolve(import.meta.dirname, "../../../packages/widget/dist");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.url().optional(),
  WEB_DIST_DIR: z.string().default(defaultWebDistDir),
  WIDGET_DIST_DIR: z.string().default(defaultWidgetDistDir),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
