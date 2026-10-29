// Verifies that the approved toolchain (U-10) installs and runs in this environment.
// Run inside the API image: `docker compose run --rm api pnpm toolchain:check`.
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";
import { pino } from "pino";
import { z } from "zod";
import { PrismaClient } from "./generated/prisma/client.js";

type Check = { name: string; run: () => Promise<string> };

const rootPackageJson = path.resolve(import.meta.dirname, "../../../package.json");

const checks: Check[] = [
  {
    name: "node",
    run: async () => {
      const major = Number(process.versions.node.split(".")[0]);
      if (major !== 24) throw new Error(`expected Node 24, got ${process.version}`);
      return process.version;
    },
  },
  {
    name: "pnpm",
    run: async () => {
      const { packageManager } = JSON.parse(readFileSync(rootPackageJson, "utf8")) as {
        packageManager?: string;
      };
      const pinned = packageManager?.match(/^pnpm@([^+]+)/)?.[1];
      const running = process.env["npm_config_user_agent"]?.match(/pnpm\/(\S+)/)?.[1];
      if (!pinned) throw new Error("packageManager is not pinned in package.json");
      if (running !== pinned) {
        throw new Error(
          `pinned pnpm ${pinned}, running ${running ?? "unknown (not run via pnpm)"}`,
        );
      }
      return running;
    },
  },
  {
    name: "argon2id",
    run: async () => {
      const hash = await argon2.hash("toolchain-check", { type: argon2.argon2id });
      if (!hash.startsWith("$argon2id$")) throw new Error("hash is not argon2id");
      if (!(await argon2.verify(hash, "toolchain-check"))) throw new Error("verify failed");
      if (await argon2.verify(hash, "wrong")) throw new Error("verify accepted a wrong password");
      return "hash + verify";
    },
  },
  {
    name: "zod",
    run: async () => {
      const schema = z.object({ email: z.email() });
      if (!schema.safeParse({ email: "a@example.com" }).success)
        throw new Error("valid input rejected");
      if (schema.safeParse({ email: "nope" }).success) throw new Error("invalid input accepted");
      return "parse";
    },
  },
  {
    name: "pino",
    run: async () => {
      const lines: string[] = [];
      const sink = new Writable({
        write(chunk: Buffer, _encoding, done) {
          lines.push(chunk.toString());
          done();
        },
      });
      pino({ redact: ["password"] }, sink).info({ password: "secret" }, "check");
      if (!lines[0]?.includes("[Redacted]")) throw new Error("redaction did not apply");
      return "log + redact";
    },
  },
  {
    name: "express-rate-limit",
    run: async () => {
      const limiter = rateLimit({ windowMs: 60_000, limit: 1 });
      if (typeof limiter !== "function") throw new Error("rateLimit did not return middleware");
      return "middleware created";
    },
  },
  {
    name: "prisma",
    run: async () => {
      const connectionString = process.env["DATABASE_URL"];
      if (!connectionString) throw new Error("DATABASE_URL is not set");
      const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
      try {
        const rows = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
        return rows[0]?.version.split(",")[0] ?? "connected";
      } finally {
        await prisma.$disconnect();
      }
    },
  },
];

let failed = 0;
console.log(`toolchain check on ${os.platform()}/${os.arch()}`);
for (const check of checks) {
  try {
    console.log(`  PASS  ${check.name}: ${await check.run()}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(failed === 0 ? "toolchain check: OK" : `toolchain check: ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
