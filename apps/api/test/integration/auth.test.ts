import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../../src/modules/auth/session-token.js";
import {
  authApp,
  PASSWORD,
  post,
  sessionToken,
  signupBody,
  withCookie,
} from "../helpers/auth-app.js";
import { disconnectTestPrisma, testPrisma, truncateAll } from "../helpers/test-db.js";

const prisma = testPrisma();
const { app } = authApp();

beforeEach(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function signup(overrides: Record<string, unknown> = {}) {
  const res = await post(app, "/api/v1/auth/signup").send(signupBody(overrides));
  return { res, token: sessionToken(res) };
}

describe("POST /auth/signup (FR-AUTH-01..03, 06, 07)", () => {
  it("creates user, workspace and OWNER membership and returns the me shape", async () => {
    const { res } = await signup({ email: "  Ada@Example.COM ", displayName: " Ada " });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ada@example.com" } });
    const membership = await prisma.workspaceMember.findFirstOrThrow({
      where: { userId: user.id },
      include: { workspace: true },
    });
    expect(membership.role).toBe("OWNER");
    expect(membership.workspace.name).toBe("Ada's workspace");
    expect(res.body).toEqual({
      user: { id: user.id, email: "ada@example.com", displayName: "Ada" },
      workspace: { id: membership.workspaceId, name: "Ada's workspace" },
      role: "OWNER",
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
  });

  it("stores an argon2id hash, never the password", async () => {
    await signup();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ada@example.com" } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });

  it("stores only the SHA-256 hash of the session token", async () => {
    const { token } = await signup();
    expect(token).toBeDefined();
    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).toBe(hashToken(token!));
    expect(JSON.stringify(sessions)).not.toContain(token!);
    const ttl = sessions[0]!.expiresAt.getTime() - sessions[0]!.createdAt.getTime();
    expect(Math.abs(ttl - 7 * 24 * 3600 * 1000)).toBeLessThan(5_000);
  });

  it("sets the session cookie with the required flags (http origin: no Secure)", async () => {
    const { res } = await signup();
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^sid=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=604800");
    expect(cookie).not.toContain("Secure");
  });

  it("sets Secure when APP_ORIGIN is https", async () => {
    const secure = authApp({ APP_ORIGIN: "https://app.example.com" });
    const res = await post(secure.app, "/api/v1/auth/signup", "https://app.example.com").send(
      signupBody(),
    );
    expect(res.status).toBe(201);
    expect((res.headers["set-cookie"] as unknown as string[])[0]).toContain("Secure");
  });

  it("returns 409 EMAIL_TAKEN with details for a normalised duplicate", async () => {
    await signup();
    const { res } = await signup({ email: " ADA@example.com " });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
    expect(res.body.error.details).toEqual([{ path: "email", message: expect.any(String) }]);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.workspace.count()).toBe(1);
  });

  it.each([
    ["short password", { password: "too short" }],
    ["bad email", { email: "nope" }],
    ["blank display name", { displayName: "   " }],
    ["unknown key workspaceId", { workspaceId: "00000000-0000-4000-8000-000000000000" }],
    ["unknown key role", { role: "OWNER" }],
  ])("returns 422 for %s and creates nothing", async (_name, overrides) => {
    const { res } = await signup(overrides);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("POST /auth/login (FR-AUTH-04, 06)", () => {
  it("logs in with the right password and returns the me shape", async () => {
    await signup();
    const res = await post(app, "/api/v1/auth/login").send({
      email: "ADA@example.com",
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("ada@example.com");
    expect(sessionToken(res)).toBeDefined();
  });

  it("gives an identical 401 for a wrong password and an unknown email", async () => {
    await signup();
    const wrong = await post(app, "/api/v1/auth/login").send({
      email: "ada@example.com",
      password: "not the password",
    });
    const unknown = await post(app, "/api/v1/auth/login").send({
      email: "nobody@example.com",
      password: "not the password",
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
    const strip = (body: { error: Record<string, unknown> }) => ({
      ...body.error,
      requestId: undefined,
    });
    expect(strip(unknown.body)).toEqual(strip(wrong.body));
    expect(sessionToken(wrong)).toBeUndefined();
    expect(sessionToken(unknown)).toBeUndefined();
  });

  it("replaces the old session when already logged in", async () => {
    const { token: first } = await signup();
    const res = await withCookie(post(app, "/api/v1/auth/login"), first!).send({
      email: "ada@example.com",
      password: PASSWORD,
    });
    const second = sessionToken(res)!;
    expect(second).not.toBe(first);
    expect(await prisma.session.count()).toBe(1);
    expect((await withCookie(request(app).get("/api/v1/auth/me"), first!)).status).toBe(401);
    expect((await withCookie(request(app).get("/api/v1/auth/me"), second)).status).toBe(200);
  });

  it("rejects unknown keys with 422", async () => {
    const res = await post(app, "/api/v1/auth/login").send({
      email: "ada@example.com",
      password: PASSWORD,
      userId: "x",
    });
    expect(res.status).toBe(422);
  });
});

describe("GET /auth/me and POST /auth/logout (FR-AUTH-08, 09)", () => {
  it("returns 401 without a cookie or with an unknown token", async () => {
    expect((await request(app).get("/api/v1/auth/me")).status).toBe(401);
    const bogus = await withCookie(request(app).get("/api/v1/auth/me"), "x".repeat(43));
    expect(bogus.status).toBe(401);
    expect(bogus.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns the caller's user and workspace", async () => {
    const { res: created, token } = await signup();
    const me = await withCookie(request(app).get("/api/v1/auth/me"), token!);
    expect(me.status).toBe(200);
    expect(me.body).toEqual(created.body);
  });

  it("rejects an expired session with 401", async () => {
    const { token } = await signup();
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const me = await withCookie(request(app).get("/api/v1/auth/me"), token!);
    expect(me.status).toBe(401);
  });

  it("logout deletes the session, clears the cookie and returns 204", async () => {
    const { token } = await signup();
    const res = await withCookie(post(app, "/api/v1/auth/logout"), token!);
    expect(res.status).toBe(204);
    expect((res.headers["set-cookie"] as unknown as string[])[0]).toMatch(/^sid=;/);
    expect(await prisma.session.count()).toBe(0);
    expect((await withCookie(request(app).get("/api/v1/auth/me"), token!)).status).toBe(401);
  });

  it("logout without a session is 401", async () => {
    expect((await post(app, "/api/v1/auth/logout")).status).toBe(401);
  });
});

describe("session isolation between users (no tenant data exists before I04)", () => {
  it("each cookie sees only its own account and logging one out leaves the other", async () => {
    const a = await signup({ email: "a@example.com", displayName: "Alice" });
    const b = await signup({ email: "b@example.com", displayName: "Bob" });
    const meA = await withCookie(request(app).get("/api/v1/auth/me"), a.token!);
    const meB = await withCookie(request(app).get("/api/v1/auth/me"), b.token!);
    expect(meA.body.user.email).toBe("a@example.com");
    expect(meB.body.user.email).toBe("b@example.com");
    expect(meA.body.workspace.id).not.toBe(meB.body.workspace.id);

    await withCookie(post(app, "/api/v1/auth/logout"), b.token!);
    expect((await withCookie(request(app).get("/api/v1/auth/me"), a.token!)).status).toBe(200);
    expect((await withCookie(request(app).get("/api/v1/auth/me"), b.token!)).status).toBe(401);
    expect(await prisma.session.count()).toBe(1);
  });
});

describe("Origin check (SEC-02)", () => {
  it.each([
    ["no Origin", undefined],
    ["foreign Origin", "https://evil.example.com"],
  ])("rejects POST with %s using 403 and does nothing", async (_name, origin) => {
    const req = request(app).post("/api/v1/auth/signup");
    const res = await (origin ? req.set("Origin", origin) : req).send(signupBody());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await prisma.user.count()).toBe(0);
  });

  it("does not require Origin on GET", async () => {
    expect((await request(app).get("/api/v1/auth/me")).status).toBe(401);
  });
});

describe("rate limit (FR-AUTH-10)", () => {
  it("returns 429 on the 11th attempt, counting sign-up and log-in together", async () => {
    const limited = authApp({ AUTH_RATE_LIMIT_MAX: 10 });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await post(limited.app, "/api/v1/auth/signup").send(
        signupBody({ email: `u${i}@example.com` }),
      );
      statuses.push(res.status);
    }
    for (let i = 0; i < 5; i += 1) {
      const res = await post(limited.app, "/api/v1/auth/login").send({
        email: "nobody@example.com",
        password: "whatever",
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 401, 401, 401, 401, 401]);
    const eleventh = await post(limited.app, "/api/v1/auth/login").send({
      email: "nobody@example.com",
      password: "whatever",
    });
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error.code).toBe("RATE_LIMITED");
    expect(Number(eleventh.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("runs before validation, hashing and database access", async () => {
    const limited = authApp({ AUTH_RATE_LIMIT_MAX: 10 });
    for (let i = 0; i < 10; i += 1) {
      const res = await post(limited.app, "/api/v1/auth/login").send({});
      expect(res.status).toBe(422); // invalid bodies still count against the limit
    }
    const invalid = await post(limited.app, "/api/v1/auth/login").send({});
    expect(invalid.status).toBe(429); // not 422: rejected before validation
    const signup = await post(limited.app, "/api/v1/auth/signup").send(signupBody());
    expect(signup.status).toBe(429);
    expect(await prisma.user.count()).toBe(0);
  });

  it("does not limit /health or /auth/me", async () => {
    const limited = authApp({ AUTH_RATE_LIMIT_MAX: 1 });
    for (let i = 0; i < 5; i += 1) {
      expect((await request(limited.app).get("/api/v1/health")).status).toBe(200);
      expect((await request(limited.app).get("/api/v1/auth/me")).status).toBe(401);
    }
  });
});

describe("logging (SEC-04)", () => {
  const SECRET = "Sup3r-Secret-Pw-Zq81";

  it("never logs passwords, tokens or cookies on any auth path", async () => {
    const logged = authApp();
    const created = await post(logged.app, "/api/v1/auth/signup").send(
      signupBody({ password: SECRET }),
    );
    const token = sessionToken(created)!;
    const login = await withCookie(post(logged.app, "/api/v1/auth/login"), token).send({
      email: "ada@example.com",
      password: SECRET,
    });
    const token2 = sessionToken(login)!;
    await post(logged.app, "/api/v1/auth/login").send({
      email: "ada@example.com",
      password: `${SECRET}-wrong`,
    });
    await withCookie(request(logged.app).get("/api/v1/auth/me"), token2);
    await withCookie(post(logged.app, "/api/v1/auth/logout"), token2);

    const text = logged.logs();
    expect(text).toContain('"method":"POST"'); // requests are logged...
    for (const secret of [SECRET, token, token2, hashToken(token), hashToken(token2), "sid="]) {
      expect(text).not.toContain(secret); // ...but none of this is
    }
  });

  it("a 422 with a password in the body leaks it neither in the response nor in the logs", async () => {
    const logged = authApp();
    const res = await post(logged.app, "/api/v1/auth/signup").send({
      email: "not-an-email",
      password: SECRET,
      displayName: "Ada",
      role: "OWNER",
    });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    expect(logged.logs()).not.toContain(SECRET);
    expect(logged.logs()).toContain('"status":422');
  });

  it("a malformed JSON body containing a password leaks it nowhere", async () => {
    const logged = authApp();
    const res = await post(logged.app, "/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send(`{"email":"a@b.co","password":"${SECRET}"`);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    expect(logged.logs()).not.toContain(SECRET);
  });

  it("an unexpected database failure during sign-up logs neither the email nor the hash", async () => {
    const logged = authApp();
    // Postgres rejects NUL in text, which makes Prisma fail with an error that is not P2002.
    const res = await post(logged.app, "/api/v1/auth/signup").send(
      signupBody({ email: "leaky@example.com", displayName: "A\u0000B" }),
    );
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("leaky@example.com");
    expect(logged.logs()).toContain("unhandled error");
    expect(logged.logs()).not.toContain("leaky@example.com");
    expect(logged.logs()).not.toContain("argon2");
    expect(logged.logs()).not.toContain(PASSWORD);
  });
});
