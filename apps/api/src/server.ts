import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPrisma } from "./db/client.js";
import { createLogger } from "./logger.js";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);

if (!config.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to start the API");
}
const prisma = createPrisma(config.DATABASE_URL);

const app = createApp({ config, logger, prisma });

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, "api listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
