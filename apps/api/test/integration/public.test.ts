import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authApp } from "../helpers/auth-app.js";
import { createSpace, createUserWithWorkspace } from "../helpers/factories.js";
import { TEST_ORIGIN } from "../helpers/test-config.js";
import { disconnectTestPrisma, testPrisma, truncateAll } from "../helpers/test-db.js";

const prisma = testPrisma();
const { app, logs } = authApp();

const VERSION = "2026-10-30.v1";
const formUrl = (slug: string) => `/api/v1/public/spaces/${slug}/form`;
const submitUrl = (slug: string) => `/api/v1/public/spaces/${slug}/testimonials`;

const valid = {
  authorName: "Ada Customer",
  rating: 5,
  content: "Great product, would recommend.",
  consent: true,
  consentVersion: VERSION,
};

const submit = (body: unknown, slug = "acme", a: Parameters<typeof request>[0] = app) =>
  request(a)
    .post(submitUrl(slug))
    .set("Origin", TEST_ORIGIN)
    .send(body as object);

let workspaceId: string;
let spaceId: string;

beforeEach(async () => {
  await truncateAll(prisma);
  ({
    workspace: { id: workspaceId },
  } = await createUserWithWorkspace(prisma));
  spaceId = (await createSpace(prisma, workspaceId, { slug: "acme", name: "Acme Inc" })).id;
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("GET /public/spaces/:slug/form (FR-COL-01)", () => {
  it("returns only the allowlisted fields with the rendered consent text", async () => {
    await prisma.space.update({
      where: { id: spaceId },
      data: { message: "Hello", prompts: ["What did you like?"] },
    });
    const res = await request(app).get(formUrl("acme"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: "Acme Inc",
      headline: "Tell us what you think",
      message: "Hello",
      prompts: ["What did you like?"],
      consent: {
        version: VERSION,
        text: expect.stringContaining("I agree that Acme Inc may publish my name"),
      },
    });
  });

  it("answers unknown, malformed and archived slugs with the same 404", async () => {
    await createSpace(prisma, workspaceId, { slug: "old-space", archivedAt: new Date() });
    const bodies = [];
    for (const slug of ["nope-nope", "old-space", "A%20B", "x"]) {
      const res = await request(app).get(formUrl(slug));
      expect(res.status, slug).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      bodies.push(res.body.error.message);
    }
    expect(new Set(bodies).size).toBe(1);
  });
});

describe("POST /public/spaces/:slug/testimonials", () => {
  it("stores a PENDING testimonial with consent fields (FR-COL-05)", async () => {
    const before = Date.now();
    const res = await submit({
      ...valid,
      authorName: "  Ada  ",
      authorTitle: "CTO",
      authorEmail: "Ada@Example.com",
      content: "  Great product, would recommend.  ",
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: "received" });
    const rows = await prisma.testimonial.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspaceId,
      spaceId,
      authorName: "Ada",
      authorTitle: "CTO",
      authorEmail: "ada@example.com",
      rating: 5,
      content: "Great product, would recommend.",
      moderationStatus: "PENDING",
      publishedAt: null,
      consentVersion: VERSION,
      consentWithdrawnAt: null,
      deletedAt: null,
    });
    expect(rows[0]!.consentGrantedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("stores null for omitted or blank optional fields", async () => {
    expect((await submit({ ...valid, authorTitle: "   " })).status).toBe(201);
    expect((await submit(valid)).status).toBe(201);
    const rows = await prisma.testimonial.findMany();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.authorTitle).toBeNull();
      expect(row.authorEmail).toBeNull();
    }
  });

  it("stores script tags and `$&` verbatim and answers exactly {status:'received'}", async () => {
    const content = "<script>alert(1)</script> and $& stays as typed";
    const res = await submit({ ...valid, content });
    expect(res.status).toBe(201);
    expect(res.body).toStrictEqual({ status: "received" });
    expect((await prisma.testimonial.findFirstOrThrow()).content).toBe(content);
  });

  it.each([
    ["missing consent", { consent: undefined }],
    ["consent false", { consent: false }],
    ["consent as string", { consent: "true" }],
    ["rating 0", { rating: 0 }],
    ["rating 6", { rating: 6 }],
    ["rating 3.5", { rating: 3.5 }],
    ["rating as string", { rating: "5" }],
    ["content too short", { content: "123456789" }],
    ["content short after trimming", { content: "   123456789   " }],
    ["content too long", { content: "x".repeat(2001) }],
    ["empty name", { authorName: "  " }],
    ["name too long", { authorName: "x".repeat(81) }],
    ["title too long", { authorTitle: "x".repeat(121) }],
    ["invalid email", { authorEmail: "not-an-email" }],
    ["blank email", { authorEmail: "" }],
    ["unknown field", { extra: "x" }],
    ["workspaceId", { workspaceId: "00000000-0000-4000-8000-000000000000" }],
    ["spaceId", { spaceId: "00000000-0000-4000-8000-000000000000" }],
    ["id", { id: "00000000-0000-4000-8000-000000000000" }],
    ["moderationStatus", { moderationStatus: "APPROVED" }],
    ["publishedAt", { publishedAt: new Date().toISOString() }],
    ["consentGrantedAt", { consentGrantedAt: new Date().toISOString() }],
    ["oversized honeypot", { leaveBlank: "x".repeat(201) }],
  ])("rejects %s with 422 and stores nothing", async (_name, patch) => {
    const res = await submit({ ...valid, ...patch });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(await prisma.testimonial.count()).toBe(0);
  });

  it("names the failing field in details (FR-COL-06)", async () => {
    const res = await submit({ ...valid, consent: false, rating: 9 });
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["consent", "rating"]));
  });

  it("rejects a bad request body without storing", async () => {
    const big = await submit({ ...valid, content: "x".repeat(20_000) });
    expect(big.status).toBe(400);
    const wrongType = await request(app)
      .post(submitUrl("acme"))
      .set("Origin", TEST_ORIGIN)
      .set("Content-Type", "text/plain")
      .send("hello");
    expect(wrongType.status).toBe(400);
    expect(await prisma.testimonial.count()).toBe(0);
  });

  it("answers an old or unknown consent version with 409 and stores nothing (FR-COL-03)", async () => {
    for (const consentVersion of ["2020-01-01.v0", "garbage"]) {
      const res = await submit({ ...valid, consentVersion });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONSENT_VERSION_OUTDATED");
    }
    expect(await prisma.testimonial.count()).toBe(0);
  });

  it("answers a filled honeypot with the normal 201 and stores nothing (FR-COL-04)", async () => {
    const real = await submit(valid);
    const bot = await submit({ ...valid, leaveBlank: "http://spam.example" });
    expect(bot.status).toBe(201);
    expect(bot.body).toStrictEqual(real.body);
    expect(await prisma.testimonial.count()).toBe(1);
  });

  it("no longer treats the old autofill-prone `website` key as the honeypot (strict body)", async () => {
    const res = await submit({ ...valid, website: "http://example.test" });
    expect(res.status).toBe(422);
    expect(await prisma.testimonial.count()).toBe(0);
  });

  it("answers unknown and archived Spaces with 404, even with the honeypot filled", async () => {
    await createSpace(prisma, workspaceId, { slug: "old-space", archivedAt: new Date() });
    for (const slug of ["nope-nope", "old-space"]) {
      for (const extra of [{}, { leaveBlank: "bot" }]) {
        const res = await submit({ ...valid, ...extra }, slug);
        expect(res.status, slug).toBe(404);
      }
    }
    expect(await prisma.testimonial.count()).toBe(0);
  });

  it("requires the app Origin (SEC-02)", async () => {
    for (const origin of [
      undefined,
      "https://evil.example",
      "null",
      `${TEST_ORIGIN}.evil.example`,
    ]) {
      const req = request(app).post(submitUrl("acme"));
      if (origin !== undefined) req.set("Origin", origin);
      const res = await req.send(valid);
      expect(res.status, String(origin)).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    expect(await prisma.testimonial.count()).toBe(0);
  });

  it("files each submission under the workspace that owns the slug (cross-tenant)", async () => {
    const { workspace: other } = await createUserWithWorkspace(prisma);
    const otherSpace = await createSpace(prisma, other.id, { slug: "beta" });
    expect((await submit(valid, "beta")).status).toBe(201);
    expect((await submit(valid, "acme")).status).toBe(201);
    // Aiming at the other tenant from the body is refused outright.
    const hijack = await submit(
      { ...valid, workspaceId: other.id, spaceId: otherSpace.id },
      "acme",
    );
    expect(hijack.status).toBe(422);

    expect(await prisma.testimonial.count({ where: { workspaceId, spaceId } })).toBe(1);
    expect(
      await prisma.testimonial.count({ where: { workspaceId: other.id, spaceId: otherSpace.id } }),
    ).toBe(1);
    expect(await prisma.testimonial.count()).toBe(2);
  });

  it("never logs the email, the content or the honeypot value", async () => {
    await submit({
      ...valid,
      authorEmail: "secret.person@example.com",
      content: "needle-content-xyz",
    });
    await submit({ ...valid, leaveBlank: "needle-honeypot", authorEmail: "bad" });
    await submit({ ...valid, consentVersion: "old", authorEmail: "secret.person@example.com" });
    const output = logs();
    expect(output).not.toContain("secret.person");
    expect(output).not.toContain("needle-content-xyz");
    expect(output).not.toContain("needle-honeypot");
  });
});

describe("submission rate limit (FR-COL-07)", () => {
  it("allows 5 per IP, then 429 with Retry-After; the form GET is on another bucket", async () => {
    const limited = authApp({ SUBMISSION_RATE_LIMIT_MAX: 5 });
    for (let i = 0; i < 5; i += 1) {
      expect((await submit(valid, "acme", limited.app)).status).toBe(201);
    }
    const sixth = await submit(valid, "acme", limited.app);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe("RATE_LIMITED");
    expect(Number(sixth.headers["retry-after"])).toBeGreaterThan(0);
    expect(await prisma.testimonial.count()).toBe(5);
    for (let i = 0; i < 8; i += 1) {
      expect((await request(limited.app).get(formUrl("acme"))).status).toBe(200);
    }
  });

  it("runs before validation and the database: bad bodies and bots spend budget", async () => {
    const limited = authApp({ SUBMISSION_RATE_LIMIT_MAX: 5 });
    await submit({}, "acme", limited.app); // 422
    await submit({ ...valid, leaveBlank: "bot" }, "acme", limited.app); // honeypot
    await submit(valid, "nope-nope", limited.app); // 404
    await submit({ ...valid, consentVersion: "old" }, "acme", limited.app); // 409
    await submit(valid, "acme", limited.app); // 201
    const next = await submit({}, "acme", limited.app);
    expect(next.status).toBe(429);
    expect(await prisma.testimonial.count()).toBe(1);
  });
});

describe("form rate limit", () => {
  const wallUrl = (slug: string) => `/api/v1/public/spaces/${slug}/wall`;

  it("allows the maximum per IP, then 429 with Retry-After", async () => {
    const limited = authApp({ FORM_RATE_LIMIT_MAX: 3 });
    for (let i = 0; i < 3; i += 1) {
      expect((await request(limited.app).get(formUrl("acme"))).status).toBe(200);
    }
    const res = await request(limited.app).get(formUrl("acme"));
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("is separate from the submission and wall limiters, and other routes are unaffected", async () => {
    const limited = authApp({
      FORM_RATE_LIMIT_MAX: 2,
      SUBMISSION_RATE_LIMIT_MAX: 1,
      WALL_RATE_LIMIT_MAX: 1,
    });
    // Exhaust the form bucket.
    await request(limited.app).get(formUrl("acme"));
    await request(limited.app).get(formUrl("acme"));
    expect((await request(limited.app).get(formUrl("acme"))).status).toBe(429);
    // Submission and wall buckets still have their own budget.
    expect((await submit(valid, "acme", limited.app)).status).toBe(201);
    expect((await request(limited.app).get(wallUrl("acme"))).status).toBe(200);
    expect((await request(limited.app).get("/api/v1/health")).status).toBe(200);
    // The reverse: spent submission and wall buckets leave the form bucket alone.
    const fresh = authApp({
      FORM_RATE_LIMIT_MAX: 2,
      SUBMISSION_RATE_LIMIT_MAX: 1,
      WALL_RATE_LIMIT_MAX: 1,
    });
    expect((await submit(valid, "acme", fresh.app)).status).toBe(201);
    expect((await submit(valid, "acme", fresh.app)).status).toBe(429);
    expect((await request(fresh.app).get(wallUrl("acme"))).status).toBe(200);
    expect((await request(fresh.app).get(wallUrl("acme"))).status).toBe(429);
    expect((await request(fresh.app).get(formUrl("acme"))).status).toBe(200);
  });

  it("does not leak existence: same 404 under budget, same 429 once spent", async () => {
    const other = await createUserWithWorkspace(prisma);
    await createSpace(prisma, other.workspace.id, { slug: "other-co" });
    await createSpace(prisma, workspaceId, { slug: "old-space", archivedAt: new Date() });
    const limited = authApp({ FORM_RATE_LIMIT_MAX: 6 });
    const missing = await request(limited.app).get(formUrl("nope-nope"));
    const archived = await request(limited.app).get(formUrl("old-space"));
    expect(missing.status).toBe(404);
    expect(archived.status).toBe(404);
    expect(archived.body.error.code).toBe(missing.body.error.code);
    expect(archived.body.error.message).toBe(missing.body.error.message);
    // Existing slugs in either workspace, and unknown ones, spend the same shared bucket.
    expect((await request(limited.app).get(formUrl("acme"))).status).toBe(200);
    expect((await request(limited.app).get(formUrl("other-co"))).status).toBe(200);
    expect((await request(limited.app).get(formUrl("nope-nope"))).status).toBe(404);
    expect((await request(limited.app).get(formUrl("acme"))).status).toBe(200);
    const existing429 = await request(limited.app).get(formUrl("acme"));
    const unknown429 = await request(limited.app).get(formUrl("nope-nope"));
    expect(existing429.status).toBe(429);
    expect(unknown429.status).toBe(429);
    expect(unknown429.body.error.code).toBe(existing429.body.error.code);
    expect(unknown429.body.error.message).toBe(existing429.body.error.message);
  });
});
