import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestimonialsService } from "../../src/modules/testimonials/testimonials.service.js";
import type { TestimonialAction } from "../../src/modules/testimonials/testimonials.repo.js";
import { authApp } from "../helpers/auth-app.js";
import { createSpace, createTestimonial } from "../helpers/factories.js";
import { TEST_ORIGIN } from "../helpers/test-config.js";
import { signupUser, type TestUser } from "../helpers/tenants.js";
import { disconnectTestPrisma, testPrisma, truncateAll } from "../helpers/test-db.js";

const prisma = testPrisma();
const { app } = authApp();

let owner: TestUser;
let spaceId: string;

beforeEach(async () => {
  await truncateAll(prisma);
  owner = await signupUser(app, "owner@example.com");
  spaceId = (await createSpace(prisma, owner.workspaceId)).id;
});

afterAll(async () => {
  await disconnectTestPrisma();
});

const base = (u: TestUser, space = spaceId) =>
  `/api/v1/workspaces/${u.workspaceId}/spaces/${space}/testimonials`;
const get = (path: string, u = owner) => request(app).get(path).set("Cookie", `sid=${u.token}`);
const act = (
  method: "post" | "delete",
  path: string,
  body: object | undefined = undefined,
  u = owner,
) => {
  const req = (method === "post" ? request(app).post(path) : request(app).delete(path))
    .set("Origin", TEST_ORIGIN)
    .set("Cookie", `sid=${u.token}`);
  return body === undefined ? req : req.send(body);
};
const doAction = (id: string, action: TestimonialAction, u = owner, space = spaceId) =>
  action === "delete"
    ? act("delete", `${base(u, space)}/${id}`, undefined, u)
    : act("post", `${base(u, space)}/${id}/${action}`, undefined, u);

type Seed = Parameters<typeof createTestimonial>[3];
const NOW = () => new Date();

describe("list and detail (FR-INB-01..03)", () => {
  it("lists newest first, hides deleted rows and never returns authorEmail or workspaceId", async () => {
    const t = Date.now();
    const old = await createTestimonial(prisma, owner.workspaceId, spaceId, {
      createdAt: new Date(t - 3000),
      authorEmail: "a@example.com",
    });
    const mid = await createTestimonial(prisma, owner.workspaceId, spaceId, {
      createdAt: new Date(t - 2000),
    });
    await createTestimonial(prisma, owner.workspaceId, spaceId, {
      createdAt: new Date(t - 1000),
      deletedAt: NOW(),
    });
    const res = await get(base(owner));
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([mid.id, old.id]);
    expect(res.body.nextCursor).toBeNull();
    expect(Object.keys(res.body.items[0]).sort()).toEqual(
      "authorName authorTitle consentWithdrawnAt content createdAt id moderationStatus publishedAt rating spaceId".split(
        " ",
      ),
    );
    expect(JSON.stringify(res.body)).not.toContain("a@example.com");
  });

  it("filters by status and published, and combines them", async () => {
    const w = owner.workspaceId;
    await createTestimonial(prisma, w, spaceId, { moderationStatus: "PENDING" });
    const approved = await createTestimonial(prisma, w, spaceId, { moderationStatus: "APPROVED" });
    const live = await createTestimonial(prisma, w, spaceId, {
      moderationStatus: "APPROVED",
      publishedAt: NOW(),
    });
    await createTestimonial(prisma, w, spaceId, { moderationStatus: "REJECTED" });
    const ids = async (q: string) =>
      ((await get(`${base(owner)}?${q}`)).body.items as { id: string }[]).map((i) => i.id).sort();
    expect(await ids("status=PENDING")).toHaveLength(1);
    expect(await ids("status=APPROVED")).toEqual([approved.id, live.id].sort());
    expect(await ids("published=true")).toEqual([live.id]);
    expect(await ids("published=false")).toHaveLength(3);
    expect(await ids("status=APPROVED&published=false")).toEqual([approved.id]);
    expect((await get(`${base(owner)}?status=approved`)).status).toBe(422);
    expect((await get(`${base(owner)}?published=1`)).status).toBe(422);
  });

  it("returns the detail with authorEmail and consent fields, and 404 for deleted rows", async () => {
    const row = await createTestimonial(prisma, owner.workspaceId, spaceId, {
      authorEmail: "ada@example.com",
    });
    const res = await get(`${base(owner)}/${row.id}`);
    expect(res.status).toBe(200);
    expect(res.body.authorEmail).toBe("ada@example.com");
    expect(Object.keys(res.body).sort()).toEqual(
      "authorEmail authorName authorTitle consentGrantedAt consentVersion consentWithdrawnAt content createdAt id moderationStatus publishedAt rating spaceId updatedAt".split(
        " ",
      ),
    );
    await doAction(row.id, "delete");
    expect((await get(`${base(owner)}/${row.id}`)).status).toBe(404);
  });

  it("paginates: 25 items → 20 + cursor, then 5 + null", async () => {
    const t = Date.now();
    for (let i = 0; i < 25; i += 1) {
      await createTestimonial(prisma, owner.workspaceId, spaceId, {
        createdAt: new Date(t - i * 1000),
      });
    }
    const first = await get(base(owner));
    expect(first.body.items).toHaveLength(20);
    expect(typeof first.body.nextCursor).toBe("string");
    const second = await get(`${base(owner)}?cursor=${encodeURIComponent(first.body.nextCursor)}`);
    expect(second.body.items).toHaveLength(5);
    expect(second.body.nextCursor).toBeNull();
    const all = [...first.body.items, ...second.body.items].map((i: { id: string }) => i.id);
    expect(new Set(all).size).toBe(25);
    expect((await get(`${base(owner)}?cursor=garbage`)).status).toBe(422);
    expect((await get(`${base(owner)}?limit=51`)).status).toBe(422);
  });
});

interface Expected {
  /** 409, or the state after the call. */
  conflict?: true;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  published?: boolean;
  withdrawn?: boolean;
  /** True when the call changes something and so writes exactly one audit row. */
  audit?: boolean;
}

const STATES: Record<string, Seed> = {
  pending: { moderationStatus: "PENDING" },
  approved: { moderationStatus: "APPROVED" },
  published: { moderationStatus: "APPROVED", publishedAt: new Date("2026-01-01") },
  rejected: { moderationStatus: "REJECTED" },
  "withdrawn-pending": { moderationStatus: "PENDING", consentWithdrawnAt: new Date("2026-01-01") },
  "withdrawn-approved": {
    moderationStatus: "APPROVED",
    consentWithdrawnAt: new Date("2026-01-01"),
  },
};

// FR-INB-04..08, written out in full so it does not depend on the service's own table.
const TABLE: Record<TestimonialAction, Record<string, Expected>> = {
  approve: {
    pending: { status: "APPROVED", published: false, withdrawn: false, audit: true },
    approved: { status: "APPROVED", published: false, withdrawn: false },
    published: { status: "APPROVED", published: true, withdrawn: false },
    rejected: { status: "APPROVED", published: false, withdrawn: false, audit: true },
    "withdrawn-pending": { conflict: true },
    "withdrawn-approved": { conflict: true },
  },
  reject: {
    pending: { status: "REJECTED", published: false, withdrawn: false, audit: true },
    approved: { status: "REJECTED", published: false, withdrawn: false, audit: true },
    published: { status: "REJECTED", published: false, withdrawn: false, audit: true },
    rejected: { status: "REJECTED", published: false, withdrawn: false },
    "withdrawn-pending": { status: "REJECTED", published: false, withdrawn: true, audit: true },
    "withdrawn-approved": { status: "REJECTED", published: false, withdrawn: true, audit: true },
  },
  publish: {
    pending: { conflict: true },
    approved: { status: "APPROVED", published: true, withdrawn: false, audit: true },
    published: { status: "APPROVED", published: true, withdrawn: false },
    rejected: { conflict: true },
    "withdrawn-pending": { conflict: true },
    "withdrawn-approved": { conflict: true },
  },
  unpublish: {
    pending: { status: "PENDING", published: false, withdrawn: false },
    approved: { status: "APPROVED", published: false, withdrawn: false },
    published: { status: "APPROVED", published: false, withdrawn: false, audit: true },
    rejected: { status: "REJECTED", published: false, withdrawn: false },
    "withdrawn-pending": { status: "PENDING", published: false, withdrawn: true },
    "withdrawn-approved": { status: "APPROVED", published: false, withdrawn: true },
  },
  "withdraw-consent": {
    pending: { status: "PENDING", published: false, withdrawn: true, audit: true },
    approved: { status: "APPROVED", published: false, withdrawn: true, audit: true },
    published: { status: "APPROVED", published: false, withdrawn: true, audit: true },
    rejected: { status: "REJECTED", published: false, withdrawn: true, audit: true },
    "withdrawn-pending": { status: "PENDING", published: false, withdrawn: true },
    "withdrawn-approved": { status: "APPROVED", published: false, withdrawn: true },
  },
  delete: {},
};

describe("transition table (FR-INB-04..08)", () => {
  const cases = Object.entries(TABLE).flatMap(([action, byState]) =>
    Object.entries(byState).map(([state, expected]) => [action, state, expected] as const),
  );

  it.each(cases)("%s on a %s testimonial", async (action, state, expected) => {
    const row = await createTestimonial(prisma, owner.workspaceId, spaceId, STATES[state]);
    const before = await prisma.testimonial.findUniqueOrThrow({ where: { id: row.id } });
    const res = await doAction(row.id, action as TestimonialAction);
    const after = await prisma.testimonial.findUniqueOrThrow({ where: { id: row.id } });
    const audits = await prisma.auditLog.count();

    if (expected.conflict) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_STATE");
      expect(after).toEqual(before);
      expect(audits).toBe(0);
      return;
    }
    expect(res.status).toBe(200);
    expect(after.moderationStatus).toBe(expected.status);
    expect(after.publishedAt !== null).toBe(expected.published);
    expect(after.consentWithdrawnAt !== null).toBe(expected.withdrawn);
    expect(res.body.moderationStatus).toBe(expected.status);
    expect(audits).toBe(expected.audit ? 1 : 0);
    if (!expected.audit) expect(after).toEqual(before);
  });

  it.each(Object.keys(STATES))(
    "delete on a %s testimonial soft-deletes and unpublishes",
    async (state) => {
      const row = await createTestimonial(prisma, owner.workspaceId, spaceId, STATES[state]);
      const res = await doAction(row.id, "delete");
      expect(res.status).toBe(204);
      const after = await prisma.testimonial.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.deletedAt).not.toBeNull();
      expect(after.publishedAt).toBeNull();
      expect(await prisma.auditLog.count()).toBe(1);
      // Deleted rows disappear: every action is now 404, not 409 and not idempotent.
      for (const action of [
        "approve",
        "reject",
        "publish",
        "unpublish",
        "withdraw-consent",
        "delete",
      ] as const) {
        expect((await doAction(row.id, action)).status).toBe(404);
      }
      expect(await prisma.auditLog.count()).toBe(1);
    },
  );

  it("keeps the first timestamps on repeated calls", async () => {
    const row = await createTestimonial(prisma, owner.workspaceId, spaceId, {
      moderationStatus: "APPROVED",
    });
    await doAction(row.id, "publish");
    const first = await prisma.testimonial.findUniqueOrThrow({ where: { id: row.id } });
    await doAction(row.id, "publish");
    expect(
      (await prisma.testimonial.findUniqueOrThrow({ where: { id: row.id } })).publishedAt,
    ).toEqual(first.publishedAt);
    await doAction(row.id, "withdraw-consent");
    const withdrawn = await prisma.testimonial.findUniqueOrThrow({ where: { id: row.id } });
    await doAction(row.id, "withdraw-consent");
    expect(
      (await prisma.testimonial.findUniqueOrThrow({ where: { id: row.id } })).consentWithdrawnAt,
    ).toEqual(withdrawn.consentWithdrawnAt);
  });

  it("a withdrawn item can never be published again, even after reject and approve attempts", async () => {
    const row = await createTestimonial(prisma, owner.workspaceId, spaceId, {
      moderationStatus: "APPROVED",
      publishedAt: NOW(),
    });
    await doAction(row.id, "withdraw-consent");
    await doAction(row.id, "reject");
    expect((await doAction(row.id, "approve")).status).toBe(409);
    expect((await doAction(row.id, "publish")).status).toBe(409);
    expect(
      (await prisma.testimonial.findUniqueOrThrow({ where: { id: row.id } })).publishedAt,
    ).toBeNull();
  });
});

describe("archived Space is read-only except privacy actions", () => {
  it("refuses moderation and publication, still lists and allows withdraw and delete", async () => {
    const archived = await createSpace(prisma, owner.workspaceId, { archivedAt: NOW() });
    const row = await createTestimonial(prisma, owner.workspaceId, archived.id, {
      moderationStatus: "APPROVED",
    });
    expect((await get(base(owner, archived.id))).body.items).toHaveLength(1);
    expect((await get(`${base(owner, archived.id)}/${row.id}`)).status).toBe(200);
    for (const action of ["approve", "reject", "publish", "unpublish"] as const) {
      expect((await doAction(row.id, action, owner, archived.id)).status).toBe(409);
    }
    expect(await prisma.auditLog.count()).toBe(0);
    expect((await doAction(row.id, "withdraw-consent", owner, archived.id)).status).toBe(200);
    expect((await doAction(row.id, "delete", owner, archived.id)).status).toBe(204);
  });
});

describe("audit (FR-INB-10)", () => {
  it("writes one row per effective action with the verified workspace, actor and no PII", async () => {
    const me = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    const row = await createTestimonial(prisma, owner.workspaceId, spaceId, {
      authorEmail: "private@example.com",
      content: "secret words",
    });
    const sequence = [
      "approve",
      "publish",
      "unpublish",
      "reject",
      "approve",
      "withdraw-consent",
      "delete",
    ] as const;
    for (const action of sequence) await doAction(row.id, action);
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.action)).toEqual([
      "testimonial.approve",
      "testimonial.publish",
      "testimonial.unpublish",
      "testimonial.reject",
      "testimonial.approve",
      "testimonial.withdraw_consent",
      "testimonial.delete",
    ]);
    for (const log of logs) {
      expect(log.workspaceId).toBe(owner.workspaceId);
      expect(log.actorUserId).toBe(me.userId);
      expect(log.targetType).toBe("Testimonial");
      expect(log.targetId).toBe(row.id);
      expect(Object.keys(log.metadata as object).sort()).toEqual(["from", "spaceId", "to"]);
    }
    const dump = JSON.stringify(logs);
    expect(dump).not.toContain("private@example.com");
    expect(dump).not.toContain("secret words");
  });

  it("a refused (409) call writes no AuditLog row and changes nothing", async () => {
    const pending = await createTestimonial(prisma, owner.workspaceId, spaceId);
    const withdrawn = await createTestimonial(prisma, owner.workspaceId, spaceId, {
      moderationStatus: "APPROVED",
      consentWithdrawnAt: NOW(),
    });
    const snapshot = () => prisma.testimonial.findMany({ orderBy: { id: "asc" } });
    const before = await snapshot();
    for (const [id, action] of [
      [pending.id, "publish"],
      [withdrawn.id, "approve"],
      [withdrawn.id, "publish"],
    ] as const) {
      const res = await doAction(id, action);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_STATE");
    }
    expect(await prisma.auditLog.count()).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it("rolls the change back when the audit row cannot be written", async () => {
    const row = await createTestimonial(prisma, owner.workspaceId, spaceId);
    const failingAudit = new Proxy(prisma, {
      get(target, prop) {
        const value = Reflect.get(target, prop) as unknown;
        if (prop !== "$transaction")
          return typeof value === "function" ? value.bind(target) : value;
        return (fn: (tx: unknown) => Promise<unknown>) =>
          target.$transaction((tx) =>
            fn(
              new Proxy(tx, {
                get(t, p) {
                  if (p === "auditLog")
                    return { create: () => Promise.reject(new Error("audit down")) };
                  const v = Reflect.get(t, p) as unknown;
                  return typeof v === "function" ? v.bind(t) : v;
                },
              }),
            ),
          );
      },
    });
    const service = createTestimonialsService(failingAudit);
    const member = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    await expect(
      service.act(
        { workspaceId: owner.workspaceId, userId: member.userId, role: "OWNER" },
        spaceId,
        row.id,
        "approve",
      ),
    ).rejects.toThrow("audit down");
    expect(
      (await prisma.testimonial.findUniqueOrThrow({ where: { id: row.id } })).moderationStatus,
    ).toBe("PENDING");
  });
});

describe("tenant isolation (FR-TEN-02)", () => {
  it("user B gets 404 for list, detail and every action on user A's IDs", async () => {
    const other = await signupUser(app, "other@example.com");
    const otherSpace = await createSpace(prisma, other.workspaceId);
    const a = await createTestimonial(prisma, owner.workspaceId, spaceId, {
      moderationStatus: "APPROVED",
      publishedAt: NOW(),
    });
    const before = await prisma.testimonial.findMany();
    const actions = [
      "approve",
      "reject",
      "publish",
      "unpublish",
      "withdraw-consent",
      "delete",
    ] as const;

    // (1) A's workspace in the URL, (2) B's workspace with A's Space, (3) B's own Space with A's testimonial.
    const targets = [
      { u: other, url: `/api/v1/workspaces/${owner.workspaceId}/spaces/${spaceId}/testimonials` },
      { u: other, url: `/api/v1/workspaces/${other.workspaceId}/spaces/${spaceId}/testimonials` },
      {
        u: other,
        url: `/api/v1/workspaces/${other.workspaceId}/spaces/${otherSpace.id}/testimonials`,
      },
    ];
    for (const [i, { u, url }] of targets.entries()) {
      const list = await get(url, u);
      // B's own (empty) Space lists fine; it just must not contain A's row.
      expect(list.status).toBe(i === 2 ? 200 : 404);
      expect(JSON.stringify(list.body)).not.toContain(a.id);
      expect((await get(`${url}/${a.id}`, u)).status).toBe(404);
      for (const action of actions) {
        const res =
          action === "delete"
            ? await act("delete", `${url}/${a.id}`, undefined, u)
            : await act("post", `${url}/${a.id}/${action}`, undefined, u);
        expect(res.status).toBe(404);
      }
    }
    expect(await prisma.testimonial.findMany()).toEqual(before);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("a testimonial of another Space in the same workspace is 404 under this Space", async () => {
    const second = await createSpace(prisma, owner.workspaceId);
    const row = await createTestimonial(prisma, owner.workspaceId, second.id);
    expect((await get(`${base(owner)}/${row.id}`)).status).toBe(404);
    expect((await doAction(row.id, "approve")).status).toBe(404);
    expect((await get(base(owner, second.id))).body.items).toHaveLength(1);
    expect((await get(base(owner))).body.items).toHaveLength(0);
  });

  it("requires a session and treats malformed ids as 404", async () => {
    const row = await createTestimonial(prisma, owner.workspaceId, spaceId);
    expect((await request(app).get(base(owner))).status).toBe(401);
    expect((await get(`${base(owner)}/not-a-uuid`)).status).toBe(404);
    expect((await doAction("not-a-uuid", "approve")).status).toBe(404);
    expect((await get(base(owner, "nope"))).status).toBe(404);
    expect(row.id).toBeTruthy();
  });
});

describe("no editing (FR-INB-09, FR-TEN-03)", () => {
  it("rejects forbidden keys with 422 and exposes no PATCH or PUT", async () => {
    const row = await createTestimonial(prisma, owner.workspaceId, spaceId);
    for (const body of [
      { moderationStatus: "APPROVED" },
      { publishedAt: "2026-01-01T00:00:00.000Z" },
      { workspaceId: owner.workspaceId },
      { authorName: "Mallory" },
      { content: "edited" },
    ]) {
      expect((await act("post", `${base(owner)}/${row.id}/approve`, body)).status).toBe(422);
      expect((await act("delete", `${base(owner)}/${row.id}`, body)).status).toBe(422);
    }
    for (const method of ["patch", "put"] as const) {
      const req = request(app)[method](`${base(owner)}/${row.id}`);
      const res = await req
        .set("Origin", TEST_ORIGIN)
        .set("Cookie", `sid=${owner.token}`)
        .send({ content: "edited" });
      expect(res.status).toBe(404);
    }
    const after = await prisma.testimonial.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toEqual(row);
  });
});

describe("database publish guard (SRS §4.2)", () => {
  it.each([
    ["pending", { moderationStatus: "PENDING" }],
    ["rejected", { moderationStatus: "REJECTED" }],
    ["withdrawn", { moderationStatus: "APPROVED", consentWithdrawnAt: new Date() }],
    ["deleted", { moderationStatus: "APPROVED", deletedAt: new Date() }],
  ] as const)("refuses publishedAt on a %s row even with raw SQL", async (_name, seed) => {
    const row = await createTestimonial(prisma, owner.workspaceId, spaceId, seed);
    await expect(
      prisma.$executeRaw`UPDATE "Testimonial" SET "publishedAt" = now() WHERE id = ${row.id}::uuid`,
    ).rejects.toThrow(/testimonial_publish_guard/);
  });
});

describe("randomised action sequence keeps the invariant", () => {
  // mulberry32: a fixed seed makes any failure reproducible.
  function rng(seed: number) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const WEIGHTED: TestimonialAction[] = [
    ...Array<TestimonialAction>(3).fill("approve"),
    ...Array<TestimonialAction>(2).fill("reject"),
    ...Array<TestimonialAction>(4).fill("publish"),
    ...Array<TestimonialAction>(2).fill("unpublish"),
    "withdraw-consent",
    "delete",
  ];

  it.each([20261030, 7])("seed %i: 200 random actions", async (seed) => {
    const random = rng(seed);
    const w = owner.workspaceId;
    const ids: string[] = [];
    const spawn = async () => ids.push((await createTestimonial(prisma, w, spaceId)).id);
    for (let i = 0; i < 4; i += 1) await spawn();

    const statuses = new Set<number>();
    for (let step = 0; step < 200; step += 1) {
      const slot = Math.floor(random() * ids.length);
      const action = WEIGHTED[Math.floor(random() * WEIGHTED.length)]!;
      const res = await doAction(ids[slot]!, action);
      statuses.add(res.status);
      expect([200, 204, 404, 409], `step ${step} ${action} → ${res.status}`).toContain(res.status);

      const rows = await prisma.testimonial.findMany();
      for (const row of rows) {
        if (row.publishedAt !== null) {
          expect(row.moderationStatus, `step ${step}`).toBe("APPROVED");
          expect(row.consentWithdrawnAt, `step ${step}`).toBeNull();
          expect(row.deletedAt, `step ${step}`).toBeNull();
        }
      }
      // Keep the pool alive: replace rows that reached a terminal state.
      const state = rows.find((r) => r.id === ids[slot]);
      if (state?.deletedAt || state?.consentWithdrawnAt) {
        if (random() < 0.5) ids[slot] = (await createTestimonial(prisma, w, spaceId)).id;
      }
    }
    // The run must actually exercise success and conflict paths, not just 404s.
    expect(statuses.has(200)).toBe(true);
    expect(statuses.has(409)).toBe(true);
  });
});
