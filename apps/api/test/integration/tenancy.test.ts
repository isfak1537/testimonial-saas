import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authApp } from "../helpers/auth-app.js";
import { TEST_ORIGIN } from "../helpers/test-config.js";
import { signupUser, type TestUser } from "../helpers/tenants.js";
import { createSpace } from "../helpers/factories.js";
import { disconnectTestPrisma, testPrisma, truncateAll } from "../helpers/test-db.js";

const prisma = testPrisma();
const { app } = authApp();

let a: TestUser;
let b: TestUser;
let spaceId: string;

beforeEach(async () => {
  await truncateAll(prisma);
  a = await signupUser(app, "a@example.com");
  b = await signupUser(app, "b@example.com");
  spaceId = (await createSpace(prisma, a.workspaceId, { slug: "a-space", name: "A's Space" })).id;
});

afterAll(async () => {
  await disconnectTestPrisma();
});

type Call = (workspaceId: string, spaceId: string) => request.Test;
const as = (user: TestUser, req: request.Test) =>
  req.set("Cookie", `sid=${user.token}`).set("Origin", TEST_ORIGIN);
const spaces = (w: string) => `/api/v1/workspaces/${w}/spaces`;
const body = { name: "Hijacked", slug: "hijacked", headline: "h" };

// Each call is made as user B. `calls` takes the workspace and space ids to aim at.
const calls: Record<string, (user: TestUser) => Call> = {
  list: (u) => (w) => as(u, request(app).get(spaces(w))),
  create: (u) => (w) => as(u, request(app).post(spaces(w)).send(body)),
  get: (u) => (w, s) => as(u, request(app).get(`${spaces(w)}/${s}`)),
  update: (u) => (w, s) =>
    as(
      u,
      request(app)
        .patch(`${spaces(w)}/${s}`)
        .send({ name: "Hijacked" }),
    ),
  archive: (u) => (w, s) =>
    as(
      u,
      request(app)
        .post(`${spaces(w)}/${s}/archive`)
        .send({}),
    ),
};

/** The envelope minus `requestId`, which is unique per request by design. */
const shape = (res: request.Response) => {
  const { requestId, ...error } = res.body.error;
  expect(requestId).toEqual(expect.any(String));
  return { status: res.status, error };
};

async function snapshot() {
  return {
    spaces: await prisma.space.findMany({ orderBy: { id: "asc" } }),
    members: await prisma.workspaceMember.count(),
  };
}

describe("cross-tenant isolation (FR-TEN-01, 02, SEC-01)", () => {
  describe.each(Object.keys(calls))("%s", (name) => {
    it("B aiming at A's workspace gets the same 404 as a random workspace", async () => {
      const before = await snapshot();
      const call = calls[name]!(b);
      const theirs = await call(a.workspaceId, spaceId);
      const random = await call(randomUUID(), spaceId);
      expect(theirs.status).toBe(404);
      expect(shape(theirs)).toEqual(shape(random));
      expect(await snapshot()).toEqual(before);
    });

    it("a non-UUID workspaceId is the same 404", async () => {
      const call = calls[name]!(b);
      const bad = await call("not-a-uuid", spaceId);
      const random = await call(randomUUID(), spaceId);
      expect(bad.status).toBe(404);
      expect(shape(bad)).toEqual(shape(random));
    });
  });

  describe.each(["get", "update", "archive"])(
    "%s with A's spaceId in B's own workspace",
    (name) => {
      it("gets the same 404 as a random spaceId", async () => {
        const before = await snapshot();
        const call = calls[name]!(b);
        const theirs = await call(b.workspaceId, spaceId);
        const random = await call(b.workspaceId, randomUUID());
        expect(theirs.status).toBe(404);
        expect(shape(theirs)).toEqual(shape(random));
        expect(await snapshot()).toEqual(before);
      });

      it("a non-UUID spaceId is the same 404", async () => {
        const call = calls[name]!(b);
        const bad = await call(b.workspaceId, "not-a-uuid");
        const random = await call(b.workspaceId, randomUUID());
        expect(bad.status).toBe(404);
        expect(shape(bad)).toEqual(shape(random));
      });
    },
  );

  it("B's list in B's own workspace never contains A's Space", async () => {
    const res = await calls["list"]!(b)(b.workspaceId, spaceId);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("the 404 for a non-member is never a 403", async () => {
    const res = await calls["get"]!(b)(a.workspaceId, spaceId);
    expect(res.status).not.toBe(403);
  });

  it("A can still read and edit their own Space afterwards", async () => {
    const res = await as(a, request(app).patch(`${spaces(a.workspaceId)}/${spaceId}`)).send({
      name: "Renamed",
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed");
  });

  it("B cannot move a Space by sending a workspaceId in the body", async () => {
    const before = await snapshot();
    const res = await as(b, request(app).patch(`${spaces(b.workspaceId)}/${spaceId}`)).send({
      workspaceId: b.workspaceId,
    });
    expect(res.status).toBe(422);
    expect(await snapshot()).toEqual(before);
  });
});
