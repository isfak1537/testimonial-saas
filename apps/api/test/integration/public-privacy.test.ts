import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authApp } from "../helpers/auth-app.js";
import { createSpace, createTestimonial } from "../helpers/factories.js";
import { TEST_ORIGIN } from "../helpers/test-config.js";
import { signupUser } from "../helpers/tenants.js";
import { disconnectTestPrisma, testPrisma, truncateAll } from "../helpers/test-db.js";

// SEC-06 / SRS §8: every public response, success or error, is free of private data.
const prisma = testPrisma();
const { app } = authApp();

const EMAIL = "secret.author@example.com";
const FOREIGN_EMAIL = "other.tenant@example.com";
const VERSION = "2026-10-30.v1";
const FORBIDDEN_KEYS = [
  "authorEmail",
  "workspaceId",
  "spaceId",
  "moderationStatus",
  "consentVersion",
  "consentGrantedAt",
  "consentWithdrawnAt",
  "deletedAt",
  "archivedAt",
  "createdAt",
  "updatedAt",
  "passwordHash",
  "tokenHash",
];

let secrets: string[];

beforeEach(async () => {
  await truncateAll(prisma);
  const owner = await signupUser(app, "owner@example.com");
  const other = await signupUser(app, "other@example.com");
  const space = await createSpace(prisma, owner.workspaceId, { slug: "acme", name: "Acme Inc" });
  const otherSpace = await createSpace(prisma, other.workspaceId, { slug: "other-co" });
  await createTestimonial(prisma, owner.workspaceId, space.id, {
    moderationStatus: "APPROVED",
    publishedAt: new Date(Date.UTC(2026, 9, 30)),
    authorEmail: EMAIL,
  });
  await createTestimonial(prisma, other.workspaceId, otherSpace.id, {
    moderationStatus: "APPROVED",
    publishedAt: new Date(Date.UTC(2026, 9, 30)),
    authorEmail: FOREIGN_EMAIL,
  });
  secrets = [
    EMAIL,
    FOREIGN_EMAIL,
    owner.workspaceId,
    other.workspaceId,
    space.id,
    otherSpace.id,
    "owner@example.com",
    "other@example.com",
  ];
});

afterAll(async () => {
  await disconnectTestPrisma();
});

/** Every object key at any depth. Error `details[].path` is the caller's own input, a value. */
function jsonKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => jsonKeys(item, into));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      into.add(key);
      jsonKeys(item, into);
    }
  }
  return into;
}

function expectNoPrivateData(res: request.Response) {
  const haystack = JSON.stringify(res.body) + JSON.stringify(res.headers) + res.text;
  for (const secret of secrets) expect(haystack, `value ${secret}`).not.toContain(secret);
  const keys = jsonKeys(res.body);
  for (const key of FORBIDDEN_KEYS) expect(keys.has(key), `key ${key}`).toBe(false);
  expect(res.headers["set-cookie"]).toBeUndefined();
}

const get = (path: string) => request(app).get(`/api/v1${path}`);
const post = (path: string, body: object) =>
  request(app).post(`/api/v1${path}`).set("Origin", TEST_ORIGIN).send(body);

const valid = {
  authorName: "Ada Customer",
  rating: 5,
  content: "Great product, would recommend.",
  consent: true,
  consentVersion: VERSION,
};

describe("public responses contain no private data", () => {
  it.each([
    ["Wall", "/public/spaces/acme/wall", 200],
    ["Wall, paged", "/public/spaces/acme/wall?limit=1", 200],
    ["Wall, other Space", "/public/spaces/other-co/wall", 200],
    ["collection form", "/public/spaces/acme/form", 200],
    ["Wall, unknown slug", "/public/spaces/nope/wall", 404],
    ["form, unknown slug", "/public/spaces/nope/form", 404],
    ["Wall, bad limit", "/public/spaces/acme/wall?limit=9999", 422],
    ["Wall, bad cursor", "/public/spaces/acme/wall?cursor=%25%25", 422],
    ["Wall, unknown query key", "/public/spaces/acme/wall?workspaceId=x", 422],
    ["health", "/health", 200],
  ])("GET %s", async (_name, path, status) => {
    const res = await get(path);
    expect(res.status).toBe(status);
    expectNoPrivateData(res);
  });

  it("the Wall shows its own item but nothing from another workspace", async () => {
    const res = await get("/public/spaces/acme/wall");
    expect(res.body.testimonials).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("other-co");
  });

  it.each([
    ["receipt", valid, 201],
    ["honeypot receipt", { ...valid, leaveBlank: "bot" }, 201],
    ["outdated consent", { ...valid, consentVersion: "old" }, 409],
    ["validation error", { ...valid, rating: 9, authorEmail: "not-an-email" }, 422],
    ["server-owned key", { ...valid, workspaceId: "x" }, 422],
  ])("POST submission: %s", async (_name, body, status) => {
    const res = await post("/public/spaces/acme/testimonials", body);
    expect(res.status).toBe(status);
    expectNoPrivateData(res);
    // A rejected body is never echoed back.
    expect(JSON.stringify(res.body)).not.toContain("not-an-email");
  });

  it("POST to an unknown Space", async () => {
    const res = await post("/public/spaces/nope/testimonials", valid);
    expect(res.status).toBe(404);
    expectNoPrivateData(res);
  });
});
