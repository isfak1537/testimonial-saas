import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { AppError } from "../../src/http/errors.js";
import { validate } from "../../src/http/validate.js";
import { createLogger } from "../../src/logger.js";
import { fakePrisma } from "../helpers/fake-prisma.js";
import { TEST_ORIGIN, testConfig } from "../helpers/test-config.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let fixtureDir: string;
let app: ReturnType<typeof createApp>;
let logLines: Record<string, unknown>[] = [];

const sink = new Writable({
  write(chunk: Buffer, _enc, done) {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      logLines.push(JSON.parse(line) as Record<string, unknown>);
    }
    done();
  },
});

beforeAll(async () => {
  fixtureDir = await mkdtemp(path.join(os.tmpdir(), "api-http-test-"));
  const webDistDir = path.join(fixtureDir, "web");
  const widgetDistDir = path.join(fixtureDir, "widget");
  await mkdir(webDistDir, { recursive: true });
  await mkdir(widgetDistDir, { recursive: true });
  await writeFile(path.join(webDistDir, "index.html"), "<!doctype html><title>spa</title>");
  await writeFile(path.join(widgetDistDir, "widget.v1.js"), "(function(){})()");
  app = createApp({
    config: testConfig({ WEB_DIST_DIR: webDistDir, WIDGET_DIST_DIR: widgetDistDir }),
    logger: createLogger("info", sink),
    prisma: fakePrisma(),
    registerRoutes(api) {
      api.get("/test/boom", () => {
        throw new Error("secret internal detail");
      });
      api.get("/test/app-error", () => {
        throw new AppError(409, "INVALID_STATE", "Not allowed now");
      });
      api.post(
        "/test/validate/:id",
        validate({
          params: z.object({ id: z.uuid() }),
          query: z.object({ page: z.coerce.number().int().min(1) }),
          body: z.object({ content: z.string().min(3) }),
        }),
        (_req, res) => {
          res.json({ ok: true });
        },
      );
      api.post("/test/echo", (req, res) => {
        res.json({ body: req.body });
      });
    },
  });
});

beforeEach(() => {
  logLines = [];
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

describe("request id", () => {
  it("is returned in the header and matches the error body of an unknown API route", async () => {
    const res = await request(app).get("/api/v1/x");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.headers["x-request-id"]).toMatch(UUID);
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });

  it.each(["/api/v1/health", "/", "/embed/widget.v1.js", "/embed/nope.js"])(
    "is set on %s",
    async (route) => {
      const res = await request(app).get(route);
      expect(res.headers["x-request-id"]).toMatch(UUID);
    },
  );

  it("ignores a client-supplied value", async () => {
    const res = await request(app).get("/api/v1/health").set("X-Request-Id", "attacker-value");
    expect(res.headers["x-request-id"]).toMatch(UUID);
    expect(res.headers["x-request-id"]).not.toBe("attacker-value");
  });

  it("is logged on the request line", async () => {
    const res = await request(app).get("/api/v1/health?secret=1");
    const line = logLines.find((l) => l["msg"] === "request");
    expect(line?.["requestId"]).toBe(res.headers["x-request-id"]);
    expect(line).toMatchObject({ method: "GET", path: "/health", status: 200 });
    expect(JSON.stringify(line)).not.toContain("secret=1");
  });
});

describe("error handler", () => {
  it("turns an unexpected error into a generic 500 and logs the stack", async () => {
    const res = await request(app).get("/api/v1/test/boom");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
    expect(JSON.stringify(res.body)).not.toMatch(/secret internal detail|stack|at /);
    const logged = logLines.find((l) => l["msg"] === "unhandled error");
    expect(logged?.["requestId"]).toBe(res.headers["x-request-id"]);
    expect(JSON.stringify(logged)).toContain("secret internal detail");
    expect(JSON.stringify(logged)).toContain("http.test.ts");
  });

  it("maps AppError to its status, code and message", async () => {
    const res = await request(app).get("/api/v1/test/app-error");
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "INVALID_STATE", message: "Not allowed now" });
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });
});

describe("validate", () => {
  it("returns 422 with details for params, query and body", async () => {
    const res = await request(app)
      .post("/api/v1/test/validate/not-a-uuid?page=0")
      .set("Origin", TEST_ORIGIN)
      .send({ content: "x" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    const paths = res.body.error.details.map((d: { path: string }) => d.path).sort();
    expect(paths).toEqual(["content", "id", "page"]);
    expect(res.body.error.details[0]).toHaveProperty("message");
  });

  it("passes valid input through", async () => {
    const res = await request(app)
      .post("/api/v1/test/validate/3f2b1c3e-8a52-4d3b-9f64-6a1d2e7c9b10?page=2")
      .set("Origin", TEST_ORIGIN)
      .send({ content: "hello" });
    expect(res.status).toBe(200);
  });
});

describe("JSON body handling", () => {
  it("rejects malformed JSON with 400 BAD_REQUEST", async () => {
    const res = await request(app)
      .post("/api/v1/test/echo")
      .set("Origin", TEST_ORIGIN)
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });

  it("rejects a non-JSON body with 400 BAD_REQUEST", async () => {
    const res = await request(app)
      .post("/api/v1/test/echo")
      .set("Origin", TEST_ORIGIN)
      .set("Content-Type", "text/plain")
      .send("hello");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("rejects a body over 16 KB with the envelope", async () => {
    const res = await request(app)
      .post("/api/v1/test/echo")
      .set("Origin", TEST_ORIGIN)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ a: "x".repeat(17 * 1024) }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("accepts JSON and POST without a body", async () => {
    const ok = await request(app)
      .post("/api/v1/test/echo")
      .set("Origin", TEST_ORIGIN)
      .send({ a: 1 });
    expect(ok.body).toEqual({ body: { a: 1 } });
    const empty = await request(app).post("/api/v1/test/echo").set("Origin", TEST_ORIGIN);
    expect(empty.status).toBe(200);
  });
});

describe("outside /api", () => {
  it("sends API responses with no-store", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("rejects chunked non-JSON bodies", async () => {
    const res = await request(app)
      .post("/api/v1/test/echo")
      .set("Origin", TEST_ORIGIN)
      .set("Content-Type", "text/plain")
      .set("Transfer-Encoding", "chunked")
      .send("hello");
    expect(res.status).toBe(400);
  });

  it("returns plain 404 without a stack for a missing asset", async () => {
    const res = await request(app).get("/assets/missing.js");
    expect(res.status).toBe(404);
    expect(res.text).not.toMatch(/Error|\bat /);
  });
});

describe("security headers", () => {
  it("are set on API JSON without the HTML-only headers", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers["x-frame-options"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });

  it.each([200, 404])("are set on HTML responses (status %i)", async (status) => {
    const res = await request(app).get(status === 200 ? "/" : "/nope");
    expect(res.status).toBe(status);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["content-security-policy"]).toMatch(
      /^default-src 'self'; frame-ancestors 'none'/,
    );
  });
});

describe("log redaction", () => {
  it("redacts SEC-04 fields at the top level and nested", () => {
    const logger = createLogger("info", sink);
    logger.info({
      password: "p1",
      passwordHash: "p2",
      authorEmail: "a@example.com",
      token: "t1",
      sessionToken: "t2",
      headers: { cookie: "c1", "set-cookie": "c2" },
      req: { headers: { cookie: "c3" } },
      user: { password: "p3", authorEmail: "b@example.com" },
      err: { meta: { authorEmail: "d@example.com" } },
      req2: { body: { password: "p4" } },
      body: { password: "p5" },
      Cookie: "c4",
      sid: "s1",
    });
    const line = JSON.stringify(logLines.at(-1));
    for (const secret of [
      "p1",
      "p2",
      "a@example.com",
      "t1",
      "t2",
      "c1",
      "c2",
      "c3",
      "p3",
      "b@example.com",
    ]) {
      expect(line).not.toContain(`"${secret}"`);
    }
    expect(line).toContain("[redacted]");
  });
});
