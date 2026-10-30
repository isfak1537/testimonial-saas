import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authApp } from "../helpers/auth-app.js";
import { TEST_ORIGIN } from "../helpers/test-config.js";
import { signupUser, type TestUser } from "../helpers/tenants.js";
import { disconnectTestPrisma, testPrisma, truncateAll } from "../helpers/test-db.js";

const prisma = testPrisma();
const { app } = authApp();

let owner: TestUser;

beforeEach(async () => {
  await truncateAll(prisma);
  owner = await signupUser(app, "owner@example.com");
});

afterAll(async () => {
  await disconnectTestPrisma();
});

const base = (u: TestUser) => `/api/v1/workspaces/${u.workspaceId}/spaces`;
const get = (path: string, u = owner) => request(app).get(path).set("Cookie", `sid=${u.token}`);
const send = (method: "post" | "patch", path: string, body: unknown, u = owner) =>
  (method === "post" ? request(app).post(path) : request(app).patch(path))
    .set("Origin", TEST_ORIGIN)
    .set("Cookie", `sid=${u.token}`)
    .send(body as object);

const validSpace = (overrides: Record<string, unknown> = {}) => ({
  name: "Acme",
  slug: "acme",
  headline: "Tell us what you think",
  ...overrides,
});

async function createSpace(overrides: Record<string, unknown> = {}) {
  const res = await send("post", base(owner), validSpace(overrides));
  expect(res.status).toBe(201);
  return res.body as { id: string; slug: string };
}

describe("owner CRUD and archive (FR-SPACE-01, 04, 05)", () => {
  it("creates a Space with defaults and returns exactly the allowlisted fields", async () => {
    const res = await send("post", base(owner), validSpace());
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(
      "archivedAt createdAt headline id message name prompts slug updatedAt".split(" "),
    );
    expect(res.body).toMatchObject({ message: "", prompts: [], archivedAt: null, slug: "acme" });
    const row = await prisma.space.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.workspaceId).toBe(owner.workspaceId);
  });

  it("reads, updates (including the slug) and lists", async () => {
    const { id } = await createSpace();
    expect((await get(`${base(owner)}/${id}`)).body.name).toBe("Acme");

    const patch = await send("patch", `${base(owner)}/${id}`, {
      name: "Acme 2",
      slug: "Acme-Two",
      prompts: ["What did you like?"],
    });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({
      name: "Acme 2",
      slug: "acme-two",
      prompts: ["What did you like?"],
      headline: "Tell us what you think",
    });

    const list = await get(base(owner));
    expect(list.status).toBe(200);
    expect(list.body.items.map((s: { id: string }) => s.id)).toEqual([id]);
    expect(list.body.nextCursor).toBeNull();
  });

  it("archives, hides the Space from the default list and keeps it readable", async () => {
    const { id } = await createSpace();
    const archived = await send("post", `${base(owner)}/${id}/archive`, {});
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).toEqual(expect.any(String));

    expect((await get(base(owner))).body.items).toEqual([]);
    expect((await get(`${base(owner)}?includeArchived=true`)).body.items).toHaveLength(1);
    expect((await get(`${base(owner)}/${id}`)).status).toBe(200);
  });

  it("archive is idempotent and keeps the first timestamp", async () => {
    const { id } = await createSpace();
    const first = await send("post", `${base(owner)}/${id}/archive`, {});
    const second = await send("post", `${base(owner)}/${id}/archive`, {});
    expect(second.status).toBe(200);
    expect(second.body.archivedAt).toBe(first.body.archivedAt);
  });

  it("PATCH on an archived Space is 409 INVALID_STATE and changes nothing", async () => {
    const { id } = await createSpace();
    await send("post", `${base(owner)}/${id}/archive`, {});
    const res = await send("patch", `${base(owner)}/${id}`, { name: "Changed" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATE");
    expect((await prisma.space.findUniqueOrThrow({ where: { id } })).name).toBe("Acme");
  });

  it("PATCH on a missing Space is 404", async () => {
    const res = await send("patch", `${base(owner)}/00000000-0000-4000-8000-000000000000`, {
      name: "x",
    });
    expect(res.status).toBe(404);
  });
});

describe("slug rules (FR-SPACE-02, 03)", () => {
  it("lowercases the slug on create", async () => {
    expect((await createSpace({ slug: "  MiXed-Case " })).slug).toBe("mixed-case");
  });

  it.each(["ab", "-abc", "abc-", "a_b", "a".repeat(41), "admin", "API", "w", "www"])(
    "rejects %j with 422 on the slug field",
    async (slug) => {
      const res = await send("post", base(owner), validSpace({ slug }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.error.details[0].path).toBe("slug");
    },
  );

  it("duplicate slug (any case) is 409 SLUG_TAKEN with details", async () => {
    await createSpace({ slug: "taken" });
    const res = await send("post", base(owner), validSpace({ slug: "TAKEN" }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SLUG_TAKEN");
    expect(res.body.error.details).toEqual([{ path: "slug", message: expect.any(String) }]);
  });

  it("an archived Space keeps its slug reserved", async () => {
    const { id } = await createSpace({ slug: "kept" });
    await send("post", `${base(owner)}/${id}/archive`, {});
    const res = await send("post", base(owner), validSpace({ slug: "kept" }));
    expect(res.status).toBe(409);
  });

  it("changing a slug to another Space's slug is 409 and changes nothing", async () => {
    await createSpace({ slug: "first" });
    const { id } = await createSpace({ slug: "second" });
    const res = await send("patch", `${base(owner)}/${id}`, { slug: "first" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SLUG_TAKEN");
    expect((await prisma.space.findUniqueOrThrow({ where: { id } })).slug).toBe("second");
  });

  it("a slug is unique across workspaces", async () => {
    await createSpace({ slug: "shared" });
    const other = await signupUser(app, "other@example.com");
    const res = await send("post", base(other), validSpace({ slug: "shared" }), other);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SLUG_TAKEN");
  });
});

describe("validation (FR-SPACE-01, FR-TEN-03)", () => {
  it.each([
    ["empty name", { name: "  " }],
    ["name too long", { name: "n".repeat(81) }],
    ["headline too long", { headline: "h".repeat(121) }],
    ["message too long", { message: "m".repeat(501) }],
    ["6 prompts", { prompts: ["a", "b", "c", "d", "e", "f"] }],
    ["empty prompt", { prompts: [""] }],
    ["prompt too long", { prompts: ["p".repeat(201)] }],
    ["forbidden workspaceId", { workspaceId: "00000000-0000-4000-8000-000000000000" }],
    ["forbidden id", { id: "00000000-0000-4000-8000-000000000000" }],
    ["forbidden archivedAt", { archivedAt: "2020-01-01T00:00:00Z" }],
  ])("create rejects %s with 422 and stores nothing", async (_label, overrides) => {
    const res = await send("post", base(owner), validSpace(overrides));
    expect(res.status).toBe(422);
    expect(await prisma.space.count()).toBe(0);
  });

  it("PATCH rejects an empty body and forbidden keys, and changes nothing", async () => {
    const { id } = await createSpace();
    for (const body of [{}, { workspaceId: owner.workspaceId }, { id }, { archivedAt: null }]) {
      const res = await send("patch", `${base(owner)}/${id}`, body);
      expect(res.status).toBe(422);
    }
    const row = await prisma.space.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ name: "Acme", workspaceId: owner.workspaceId, archivedAt: null });
  });

  it("accepts the maximum sizes", async () => {
    const res = await send(
      "post",
      base(owner),
      validSpace({
        name: "n".repeat(80),
        headline: "h".repeat(120),
        message: "m".repeat(500),
        prompts: Array.from({ length: 5 }, () => "p".repeat(200)),
      }),
    );
    expect(res.status).toBe(201);
  });
});

describe("list pagination (FR-SPACE-04)", () => {
  it("walks every page newest first without duplicates", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await createSpace({ slug: `space-${i}` })).id);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `${base(owner)}?limit=2${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await get(url);
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((s: { id: string }) => s.id));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toEqual([...ids].reverse());
  });

  it.each([
    ["limit=0"],
    ["limit=51"],
    ["limit=abc"],
    ["cursor=garbage"],
    ["includeArchived=yes"],
    ["x=1"],
  ])("rejects ?%s with 422", async (query) => {
    expect((await get(`${base(owner)}?${query}`)).status).toBe(422);
  });

  it("a cursor from another workspace never reveals that workspace's data", async () => {
    // "theirs" is older than every cursor position taken from the owner's list.
    const other = await signupUser(app, "other@example.com");
    await send("post", base(other), validSpace({ slug: "theirs" }), other);
    await new Promise((resolve) => setTimeout(resolve, 5));
    for (let i = 0; i < 3; i++) await createSpace({ slug: `mine-${i}` });
    const page = await get(`${base(owner)}?limit=1`);
    const res = await get(`${base(owner)}?cursor=${page.body.nextCursor}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((s: { slug: string }) => s.slug.startsWith("mine-"))).toBe(true);
    const crossed = await get(`${base(other)}?cursor=${page.body.nextCursor}`, other);
    expect(crossed.body.items.map((s: { slug: string }) => s.slug)).toEqual(["theirs"]);
  });
});

describe("authentication", () => {
  it("no cookie is 401 on every route", async () => {
    const path = `${base(owner)}/00000000-0000-4000-8000-000000000000`;
    expect((await request(app).get(base(owner))).status).toBe(401);
    expect((await request(app).get(path)).status).toBe(401);
    expect(
      (await request(app).post(base(owner)).set("Origin", TEST_ORIGIN).send(validSpace())).status,
    ).toBe(401);
  });

  it("a state-changing request without the right Origin is 403 (SEC-02)", async () => {
    const res = await request(app)
      .post(base(owner))
      .set("Cookie", `sid=${owner.token}`)
      .set("Origin", "http://evil.example")
      .send(validSpace());
    expect(res.status).toBe(403);
    expect(await prisma.space.count()).toBe(0);
  });
});
