import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createPrisma } from "../../src/db/client.js";
import { createLogger } from "../../src/logger.js";
import { disconnectTestPrisma, testPrisma } from "../helpers/test-db.js";

const config = { WEB_DIST_DIR: "/nonexistent-web", WIDGET_DIST_DIR: "/nonexistent-widget" };

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("GET /api/v1/health (FR-OPS-02)", () => {
  it("reports the database as up", async () => {
    const app = createApp({ config, logger: createLogger("silent"), prisma: testPrisma() });
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "up" });
  });

  it("returns 503 when the database is unreachable", async () => {
    // Port 1 refuses connections immediately.
    const dead = createPrisma("postgresql://nobody:nothing@127.0.0.1:1/none");
    try {
      const app = createApp({ config, logger: createLogger("silent"), prisma: dead });
      const res = await request(app).get("/api/v1/health");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: "degraded", db: "down" });
    } finally {
      await dead.$disconnect();
    }
  });
});
