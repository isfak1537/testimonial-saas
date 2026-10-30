import { randomBytes } from "node:crypto";
import argon2 from "argon2";

/**
 * FR-AUTH-05. Pinned explicitly (they equal the argon2 0.45 defaults) so a library upgrade
 * can never weaken them silently. Verification reads the parameters from the stored hash.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536, // KiB = 64 MiB
  timeCost: 3,
  parallelism: 4,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/** A malformed stored hash (e.g. a test factory placeholder) counts as a mismatch, never a 500. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Built when this module is first imported (API start-up), so the first log-in for an unknown
// email costs the same as any other. FR-AUTH-04. The secret is random and never stored.
const DUMMY_HASH = await hashPassword(randomBytes(32).toString("base64url"));

/** Burns the same time as a real check; always false. */
export async function verifyAgainstDummy(password: string): Promise<false> {
  await verifyPassword(DUMMY_HASH, password);
  return false;
}
