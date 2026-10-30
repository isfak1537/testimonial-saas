import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { createLogger } from "../../src/logger.js";
import { fakePrisma } from "../helpers/fake-prisma.js";
import { testConfig } from "../helpers/test-config.js";

function appWith(ping: () => Promise<unknown>) {
  return createApp({
    config: testConfig(),
    logger: createLogger("silent"),
    prisma: fakePrisma(ping),
  });
}

describe("health ping cache", () => {
  it("shares one database ping between requests within the window", async () => {
    const ping = vi.fn(async () => [{ "?column?": 1 }]);
    const app = appWith(ping);
    const results = await Promise.all([1, 2, 3].map(() => request(app).get("/api/v1/health")));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    await request(app).get("/api/v1/health");
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("pings again after the window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const ping = vi.fn(async () => [{ "?column?": 1 }]);
      const app = appWith(ping);
      await request(app).get("/api/v1/health");
      vi.setSystemTime(Date.now() + 1_500);
      await request(app).get("/api/v1/health");
      expect(ping).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a separate cache per app instance", async () => {
    const down = appWith(async () => {
      throw new Error("down");
    });
    const up = appWith(async () => [{ "?column?": 1 }]);
    expect((await request(down).get("/api/v1/health")).status).toBe(503);
    expect((await request(up).get("/api/v1/health")).status).toBe(200);
  });
});
