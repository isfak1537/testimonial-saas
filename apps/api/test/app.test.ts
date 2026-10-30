import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createLogger } from "../src/logger.js";

let fixtureDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  fixtureDir = await mkdtemp(path.join(os.tmpdir(), "api-app-test-"));
  const webDistDir = path.join(fixtureDir, "web");
  const widgetDistDir = path.join(fixtureDir, "widget");
  await mkdir(path.join(webDistDir, "assets"), { recursive: true });
  await mkdir(widgetDistDir, { recursive: true });
  await writeFile(path.join(webDistDir, "index.html"), "<!doctype html><title>spa</title>");
  await writeFile(path.join(webDistDir, "assets", "index-abc123.js"), "console.log(1)");
  await writeFile(path.join(widgetDistDir, "widget.v1.js"), "(function(){})()");
  app = createApp({
    config: { WEB_DIST_DIR: webDistDir, WIDGET_DIST_DIR: widgetDistDir },
    logger: createLogger("silent"),
  });
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

describe("health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("unknown API routes", () => {
  it("return a JSON 404 instead of the SPA", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.type).toBe("application/json");
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("widget embed", () => {
  it("serves the bundle with a 5 minute public cache", async () => {
    const res = await request(app).get("/embed/widget.v1.js");
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/javascript/);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
  });

  it("returns 404 for unknown embed files", async () => {
    const res = await request(app).get("/embed/other.js");
    expect(res.status).toBe(404);
  });
});

describe("web app", () => {
  it.each(["/", "/login", "/signup", "/app", "/app/settings", "/c/acme", "/w/acme"])(
    "serves the SPA with 200 for %s",
    async (route) => {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.type).toBe("text/html");
      expect(res.headers["cache-control"]).toBe("no-cache");
    },
  );

  it.each(["/nope", "/c", "/c/acme/extra", "/w/"])(
    "serves the SPA not-found page with 404 for %s",
    async (route) => {
      const res = await request(app).get(route);
      expect(res.status).toBe(404);
      expect(res.type).toBe("text/html");
    },
  );

  it("caches hashed assets as immutable", async () => {
    const res = await request(app).get("/assets/index-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("returns 404 for missing assets instead of the SPA", async () => {
    const res = await request(app).get("/assets/missing.js");
    expect(res.status).toBe(404);
  });

  it("does not serve the SPA for non-GET requests", async () => {
    const res = await request(app).post("/");
    expect(res.status).toBe(404);
  });
});
