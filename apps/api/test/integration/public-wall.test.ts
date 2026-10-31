import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authApp } from "../helpers/auth-app.js";
import { createSpace, createTestimonial } from "../helpers/factories.js";
import { TEST_ORIGIN } from "../helpers/test-config.js";
import { signupUser, type TestUser } from "../helpers/tenants.js";
import { disconnectTestPrisma, testPrisma, truncateAll } from "../helpers/test-db.js";

const prisma = testPrisma();
const { app } = authApp();

const wallUrl = (slug: string, query = "") => `/api/v1/public/spaces/${slug}/wall${query}`;
const wall = (slug: string, query = "") => request(app).get(wallUrl(slug, query));

const EMAIL = "secret.author@example.com";
const T0 = Date.UTC(2026, 9, 30, 12, 0, 0);
const at = (seconds: number) => new Date(T0 + seconds * 1000);

type Seed = Parameters<typeof createTestimonial>[3];
const PUBLIC: Seed = {
  moderationStatus: "APPROVED",
  publishedAt: at(0),
  authorEmail: EMAIL,
};

let owner: TestUser;
let spaceId: string;

const seed = (o: Seed = {}, space = spaceId, workspace = owner.workspaceId) =>
  createTestimonial(prisma, workspace, space, { ...PUBLIC, ...o });

beforeEach(async () => {
  await truncateAll(prisma);
  owner = await signupUser(app, "owner@example.com");
  spaceId = (await createSpace(prisma, owner.workspaceId, { slug: "acme", name: "Acme Inc" })).id;
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("what appears (FR-WALL-01..03)", () => {
  it("returns a public item with exactly the allowlisted keys", async () => {
    const t = await seed({ authorName: "Grace", authorTitle: "CTO", content: "Superb." });
    const res = await wall("acme");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      space: { name: "Acme Inc", headline: "Tell us what you think" },
      testimonials: [
        {
          id: t.id,
          authorName: "Grace",
          authorTitle: "CTO",
          rating: 5,
          content: "Superb.",
          publishedAt: at(0).toISOString(),
        },
      ],
      nextCursor: null,
    });
    expect(Object.keys(res.body).sort()).toEqual(["nextCursor", "space", "testimonials"]);
    expect(Object.keys(res.body.space).sort()).toEqual(["headline", "name"]);
    expect(Object.keys(res.body.testimonials[0]).sort()).toEqual([
      "authorName",
      "authorTitle",
      "content",
      "id",
      "publishedAt",
      "rating",
    ]);
  });

  it("shows a null authorTitle as null", async () => {
    await seed();
    expect((await wall("acme")).body.testimonials[0].authorTitle).toBeNull();
  });

  it("leaks no private field anywhere in the body", async () => {
    await seed();
    const res = await wall("acme");
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(owner.workspaceId);
    expect(text).not.toContain(spaceId);
    for (const key of [
      "authorEmail",
      "workspaceId",
      "spaceId",
      "moderationStatus",
      "consent",
      "deletedAt",
      "createdAt",
      "slug",
    ]) {
      expect(text, key).not.toContain(key);
    }
  });

  it("has an empty list, not an error, for a Space without public items", async () => {
    const res = await wall("acme");
    expect(res.status).toBe(200);
    expect(res.body.testimonials).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it("excludes an unpublished item", async () => {
    await seed();
    const hidden = await seed({ authorName: "Hidden", publishedAt: null });
    const res = await wall("acme");
    expect(res.body.testimonials).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(hidden.id);
  });

  it("answers an archived Space with 404, even for items that were public", async () => {
    await seed();
    expect((await wall("acme")).status).toBe(200);
    await prisma.space.update({ where: { id: spaceId }, data: { archivedAt: new Date() } });
    const res = await wall("acme");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("answers unknown, malformed and archived slugs with the same 404 body", async () => {
    await createSpace(prisma, owner.workspaceId, { slug: "old-space", archivedAt: new Date() });
    const bodies = [];
    for (const slug of ["nope-nope", "old-space", "A%20B", "x", "%00"]) {
      const res = await wall(slug);
      expect(res.status, slug).toBe(404);
      bodies.push(res.body.error.code + res.body.error.message);
    }
    expect(new Set(bodies).size).toBe(1);
  });
});

// The database refuses a published row that is pending, rejected, withdrawn or deleted
// (testimonial_publish_guard). To prove the query enforces each condition by itself, these tests
// drop that guard, seed the impossible row, and restore the guard afterwards.
describe("the query enforces every condition without the database guard", () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Testimonial" DROP CONSTRAINT testimonial_publish_guard',
    );
  });
  afterAll(async () => {
    await truncateAll(prisma);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Testimonial" ADD CONSTRAINT testimonial_publish_guard CHECK (
      "publishedAt" IS NULL OR (
        "moderationStatus" = 'APPROVED' AND "consentWithdrawnAt" IS NULL AND "deletedAt" IS NULL
      )
    )`);
  });

  it.each<[string, Seed]>([
    ["pending", { moderationStatus: "PENDING" }],
    ["rejected", { moderationStatus: "REJECTED" }],
    ["consent withdrawn", { consentWithdrawnAt: at(1) }],
    ["deleted", { deletedAt: at(1) }],
  ])("excludes a published but %s item", async (_name, override) => {
    await seed();
    const hidden = await seed({ authorName: "Hidden", ...override });
    const res = await wall("acme");
    expect(res.status).toBe(200);
    expect(res.body.testimonials).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(hidden.id);
  });

  it("excludes items of a Space archived after the slug lookup", async () => {
    // The lookup already 404s an archived Space; this checks the same condition inside the item query.
    const { PUBLIC_WHERE } = await import("../../src/modules/testimonials/testimonials.repo.js");
    expect(PUBLIC_WHERE.space).toEqual({ archivedAt: null });
    await seed();
    await prisma.space.update({ where: { id: spaceId }, data: { archivedAt: new Date() } });
    const rows = await prisma.testimonial.findMany({
      where: { spaceId, workspaceId: owner.workspaceId, ...PUBLIC_WHERE },
    });
    expect(rows).toEqual([]);
  });
});

describe("visibility follows the real owner actions", () => {
  const base = () => `/api/v1/workspaces/${owner.workspaceId}/spaces/${spaceId}`;
  const owned = (req: request.Test) =>
    req.set("Origin", TEST_ORIGIN).set("Cookie", `sid=${owner.token}`);
  const post = (path: string) => owned(request(app).post(`${base()}${path}`));
  const visible = async () => (await wall("acme")).body.testimonials.length as number;

  it("approve + publish shows the item; each undoing action hides it", async () => {
    const make = () =>
      createTestimonial(prisma, owner.workspaceId, spaceId, { authorEmail: EMAIL }).then(
        (t) => t.id,
      );
    const publish = async (id: string) => {
      expect((await post(`/testimonials/${id}/approve`)).status).toBe(200);
      expect(await visible()).toBe(0); // approved but not published
      expect((await post(`/testimonials/${id}/publish`)).status).toBe(200);
    };

    const a = await make();
    await publish(a);
    expect(await visible()).toBe(1);
    expect((await post(`/testimonials/${a}/unpublish`)).status).toBe(200);
    expect(await visible()).toBe(0);

    const b = await make();
    await publish(b);
    expect((await post(`/testimonials/${b}/withdraw-consent`)).status).toBe(200);
    expect(await visible()).toBe(0);

    const c = await make();
    await publish(c);
    expect((await post(`/testimonials/${c}/reject`)).status).toBe(200);
    expect(await visible()).toBe(0);

    const d = await make();
    await publish(d);
    expect((await owned(request(app).delete(`${base()}/testimonials/${d}`))).status).toBe(204);
    expect(await visible()).toBe(0);

    const e = await make();
    await publish(e);
    expect(await visible()).toBe(1);
    expect((await post("/archive")).status).toBe(200);
    expect((await wall("acme")).status).toBe(404);
  });
});

describe("tenant and Space separation", () => {
  it("never shows another Space's or workspace's public items", async () => {
    const other = await signupUser(app, "other@example.com");
    const otherSpace = await createSpace(prisma, other.workspaceId, { slug: "other-co" });
    const sibling = await createSpace(prisma, owner.workspaceId, { slug: "acme-two" });
    const mine = await seed({ authorName: "Mine" });
    const foreign = await seed({ authorName: "Foreign" }, otherSpace.id, other.workspaceId);
    const siblingItem = await seed({ authorName: "Sibling" }, sibling.id);

    const res = await wall("acme");
    expect(res.body.testimonials.map((t: { id: string }) => t.id)).toEqual([mine.id]);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(foreign.id);
    expect(text).not.toContain(siblingItem.id);
    expect((await wall("other-co")).body.testimonials.map((t: { id: string }) => t.id)).toEqual([
      foreign.id,
    ]);
  });
});

describe("ordering and pagination (FR-WALL-02, FR-WALL-05)", () => {
  it("orders by publishedAt desc", async () => {
    const old = await seed({ publishedAt: at(1) });
    const mid = await seed({ publishedAt: at(2) });
    const recent = await seed({ publishedAt: at(3) });
    const ids = (await wall("acme")).body.testimonials.map((t: { id: string }) => t.id);
    expect(ids).toEqual([recent.id, mid.id, old.id]);
  });

  it("pages without gaps or duplicates, including equal publishedAt", async () => {
    const created = [];
    for (let i = 0; i < 5; i++) created.push((await seed({ publishedAt: at(i < 3 ? 0 : i) })).id);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await wall(
        "acme",
        `?limit=2${cursor ? `&cursor=${cursor}` : ""}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.testimonials.length).toBeLessThanOrEqual(2);
      seen.push(...res.body.testimonials.map((t: { id: string }) => t.id));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(cursor).toBeNull();
    expect([...seen].sort()).toEqual([...created].sort());
    expect(new Set(seen).size).toBe(5);
  });

  it("defaults to 20 items and accepts up to 50", async () => {
    await prisma.testimonial.createMany({
      data: Array.from({ length: 21 }, (_, i) => ({
        workspaceId: owner.workspaceId,
        spaceId,
        authorName: `A${i}`,
        rating: 4,
        content: "Good enough content",
        moderationStatus: "APPROVED" as const,
        publishedAt: at(i),
        consentVersion: "2026-10-30.v1",
        consentGrantedAt: at(0),
      })),
    });
    const first = await wall("acme");
    expect(first.body.testimonials).toHaveLength(20);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    expect((await wall("acme", "?limit=50")).body.testimonials).toHaveLength(21);
  });

  it.each([
    "?limit=0",
    "?limit=51",
    "?limit=abc",
    "?limit=-1",
    "?cursor=!!!",
    "?workspaceId=x",
    "?status=PENDING",
  ])("rejects %s with 422", async (query) => {
    const res = await wall("acme", query);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("a cursor from another Space's Wall never returns that Space's or workspace's items", async () => {
    const other = await signupUser(app, "other@example.com");
    const otherSpace = await createSpace(prisma, other.workspaceId, { slug: "other-co" });
    const ownA = await seed({ authorName: "A-old", publishedAt: at(1) });
    await seed({ authorName: "A-new", publishedAt: at(100) });
    const foreignIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      foreignIds.push(
        (
          await seed(
            { authorName: `F${i}`, publishedAt: at(10 + i) },
            otherSpace.id,
            other.workspaceId,
          )
        ).id,
      );
    }
    const foreignPage = await wall("other-co", "?limit=1");
    const foreignCursor = foreignPage.body.nextCursor as string;
    expect(foreignCursor).toEqual(expect.any(String));

    // Replayed on our Wall: only our items, positioned by the cursor's timestamp and id.
    const res = await wall("acme", `?cursor=${foreignCursor}`);
    expect(res.status).toBe(200);
    const ids = res.body.testimonials.map((t: { id: string }) => t.id);
    expect(ids).toEqual([ownA.id]);
    for (const id of foreignIds) expect(JSON.stringify(res.body)).not.toContain(id);

    // And the reverse direction.
    const ownCursor = (await wall("acme", "?limit=1")).body.nextCursor as string;
    const back = await wall("other-co", `?cursor=${ownCursor}`);
    expect(back.status).toBe(200);
    for (const t of back.body.testimonials) expect(foreignIds).toContain(t.id);
  });

  it("crafted cursors cannot reach other rows: ids of other Spaces or far-future positions return nothing foreign", async () => {
    const other = await signupUser(app, "other@example.com");
    const otherSpace = await createSpace(prisma, other.workspaceId, { slug: "other-co" });
    const foreign = await seed({ publishedAt: at(5) }, otherSpace.id, other.workspaceId);
    await seed({ publishedAt: at(1) });
    const craft = (iso: string, id: string) => Buffer.from(`${iso}|${id}`).toString("base64url");
    for (const cursor of [
      craft("9999-12-31T23:59:59.999Z", foreign.id),
      craft(at(5).toISOString(), foreign.id),
      craft("0001-01-01T00:00:00.000Z", foreign.id),
    ]) {
      const res = await wall("acme", `?cursor=${cursor}`);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(foreign.id);
    }
  });
});

describe("headers (FR-WALL-04)", () => {
  it.each([
    ["200", "acme", 200],
    ["404", "nope-nope", 404],
    ["422", "acme?limit=0", 422],
  ])("%s carries CORS * and no-store, never credentials", async (_n, slugAndQuery, status) => {
    const [slug, query] = slugAndQuery.split("?");
    const res = await wall(slug!, query ? `?${query}` : "");
    expect(res.status).toBe(status);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("is readable without a session and ignores any cookie", async () => {
    await seed();
    const res = await wall("acme")
      .set("Cookie", `sid=${owner.token}`)
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});

describe("rate limit (FR-WALL-05)", () => {
  it("returns 429 with Retry-After and CORS after the maximum, on its own bucket", async () => {
    const limited = authApp({ WALL_RATE_LIMIT_MAX: 3 });
    for (let i = 0; i < 3; i++) {
      expect((await request(limited.app).get(wallUrl("acme"))).status).toBe(200);
    }
    const res = await request(limited.app).get(wallUrl("acme"));
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    // The collection form is not on the Wall bucket.
    expect((await request(limited.app).get("/api/v1/public/spaces/acme/form")).status).toBe(200);
  });
});

describe("XSS payloads (SEC-05)", () => {
  it("come back as inert JSON strings, unchanged", async () => {
    const payloads = [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      '"><svg/onload=alert(1)>',
    ];
    for (const [i, p] of payloads.entries()) {
      await seed({ authorName: p, authorTitle: p, content: p, publishedAt: at(i) });
    }
    const res = await wall("acme");
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    const items = res.body.testimonials as { authorName: string; content: string }[];
    expect(items.map((t) => t.content).sort()).toEqual([...payloads].sort());
    expect(items.map((t) => t.authorName).sort()).toEqual([...payloads].sort());
  });
});
