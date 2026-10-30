import { createHash, randomBytes } from "node:crypto";

/** FR-AUTH-07: 32 random bytes, base64url. Only `hashToken(token)` is ever stored. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
