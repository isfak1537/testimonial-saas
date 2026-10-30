import type { PrismaClient } from "../../src/generated/prisma/client.js";

/**
 * Unit tests never touch a database. Only `$queryRaw` (the health ping) is stubbed;
 * any other use fails loudly so a unit test cannot silently depend on a real DB.
 */
export function fakePrisma(ping: () => Promise<unknown> = async () => [{ "?column?": 1 }]) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "$queryRaw") return ping;
        throw new Error(`fakePrisma: ${String(prop)} is not available in unit tests`);
      },
    },
  ) as unknown as PrismaClient;
}
