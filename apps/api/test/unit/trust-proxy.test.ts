import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { createLogger } from "../../src/logger.js";
import { fakePrisma } from "../helpers/fake-prisma.js";
import { TEST_ORIGIN, testConfig } from "../helpers/test-config.js";

function appWith(hops: number) {
  return createApp({
    config: testConfig({ TRUST_PROXY_HOPS: hops, AUTH_RATE_LIMIT_MAX: 2 }),
    logger: createLogger("silent"),
    prisma: fakePrisma(),
    registerRoutes: (api) => {
      api.get("/_ip", (req, res) => {
        res.json({ ip: req.ip });
      });
    },
  });
}

/** An empty body is rejected with 422 after the limiter, so no database is involved. */
function login(app: ReturnType<typeof appWith>, forwardedFor: string) {
  return request(app)
    .post("/api/v1/auth/login")
    .set("Origin", TEST_ORIGIN)
    .set("X-Forwarded-For", forwardedFor)
    .send({});
}

beforeEach(() => {
  // express-rate-limit logs ERR_ERL_UNEXPECTED_X_FORWARDED_FOR when the header meets the default.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("trust proxy", () => {
  it("default: X-Forwarded-For is ignored", async () => {
    const res = await request(appWith(0)).get("/api/v1/_ip").set("X-Forwarded-For", "203.0.113.7");
    expect(res.body.ip).not.toBe("203.0.113.7");
    expect(res.body.ip).toMatch(/127\.0\.0\.1|::1/);
  });

  it("1 hop: the address the proxy appended is used", async () => {
    const res = await request(appWith(1)).get("/api/v1/_ip").set("X-Forwarded-For", "203.0.113.7");
    expect(res.body.ip).toBe("203.0.113.7");
  });

  it("1 hop: a forged left-most entry is ignored", async () => {
    const res = await request(appWith(1))
      .get("/api/v1/_ip")
      .set("X-Forwarded-For", "1.1.1.1, 203.0.113.7");
    expect(res.body.ip).toBe("203.0.113.7");
  });

  it("default: a spoofed header cannot bypass the limiter", async () => {
    const app = appWith(0);
    expect((await login(app, "198.51.100.1")).status).toBe(422);
    expect((await login(app, "198.51.100.2")).status).toBe(422);
    const third = await login(app, "198.51.100.3");
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe("RATE_LIMITED");
  });

  it("1 hop: clients behind the proxy get separate buckets", async () => {
    const app = appWith(1);
    await login(app, "198.51.100.1");
    await login(app, "198.51.100.1");
    expect((await login(app, "198.51.100.1")).status).toBe(429);
    expect((await login(app, "198.51.100.2")).status).toBe(422);
  });

  it("1 hop: forging the left-most entry does not give a fresh bucket", async () => {
    const app = appWith(1);
    await login(app, "9.9.9.1, 198.51.100.1");
    await login(app, "9.9.9.2, 198.51.100.1");
    expect((await login(app, "9.9.9.3, 198.51.100.1")).status).toBe(429);
  });
});
