import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

/** Repos take this so the same function works inside or outside a transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;
