import { Writable } from "node:stream";
import request from "supertest";
import { createApp, type AppOptions } from "../../src/app.js";
import { createLogger } from "../../src/logger.js";
import { testPrisma } from "./test-db.js";
import { TEST_ORIGIN, testConfig } from "./test-config.js";

/** An app on the real test database whose log output is captured as text. */
export function authApp(config: Partial<AppOptions["config"]> = {}) {
  let output = "";
  const sink = new Writable({
    write(chunk: Buffer, _enc, done) {
      output += chunk.toString();
      done();
    },
  });
  const app = createApp({
    config: testConfig(config),
    logger: createLogger("debug", sink),
    prisma: testPrisma(),
  });
  return { app, logs: () => output };
}

export const PASSWORD = "correct horse battery";

export function signupBody(overrides: Record<string, unknown> = {}) {
  return {
    email: "ada@example.com",
    password: PASSWORD,
    displayName: "Ada",
    ...overrides,
  };
}

/** The raw `sid` value from a response's Set-Cookie header, if one is set. */
export function sessionToken(res: request.Response): string | undefined {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  const match = header?.map((c) => /^sid=([^;]*)/.exec(c)?.[1]).find((v) => v !== undefined);
  return match || undefined;
}

export function post(app: Parameters<typeof request>[0], path: string, origin = TEST_ORIGIN) {
  return request(app).post(path).set("Origin", origin);
}

export function withCookie(req: request.Test, token: string): request.Test {
  return req.set("Cookie", `sid=${token}`);
}
