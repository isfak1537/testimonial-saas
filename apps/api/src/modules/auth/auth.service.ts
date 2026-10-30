import type { LoginBody, MeResponse, SignupBody } from "@testimonial-saas/shared";
import type { Config } from "../../config.js";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { Db } from "../../db/types.js";
import { AppError } from "../../http/errors.js";
import { toMe } from "./auth.mappers.js";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password.js";
import { hashToken, newSessionToken } from "./session-token.js";
import * as sessions from "./sessions.repo.js";
import * as users from "./users.repo.js";

type AuthConfig = Pick<Config, "SESSION_TTL_DAYS">;

export interface AuthResult {
  me: MeResponse;
  /** Raw session token: goes into the cookie only; the database gets its hash. */
  token: string;
}

const invalidCredentials = () =>
  new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");

const emailTaken = () =>
  new AppError(409, "EMAIL_TAKEN", "An account with this email already exists", [
    { path: "email", message: "Already registered" },
  ]);

interface UniqueViolationMeta {
  target?: unknown;
  driverAdapterError?: { cause?: { constraint?: { fields?: unknown; index?: unknown } } };
}

/**
 * Only a unique violation on User.email is EMAIL_TAKEN; any other target stays a 500.
 * With the pg driver adapter Prisma 7 omits `meta.target` and reports the violated constraint
 * under `meta.driverAdapterError.cause.constraint` instead (`index: "User_email_key"`), so both
 * shapes are read.
 */
export function isEmailUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const meta = (error.meta ?? {}) as UniqueViolationMeta;
  const constraint = meta.driverAdapterError?.cause?.constraint;
  const names = [meta.target, constraint?.fields, constraint?.index].flatMap((value) =>
    Array.isArray(value) ? value : value === undefined ? [] : [value],
  );
  return names.some((name) => typeof name === "string" && /(^|_)email(_|$)/.test(name));
}

export function createAuthService(prisma: PrismaClient, config: AuthConfig) {
  async function startSession(db: Db, userId: string): Promise<string> {
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    await sessions.createSession(db, { tokenHash: hashToken(token), userId, expiresAt });
    return token;
  }

  async function loadMe(userId: string, user: MeResponse["user"]): Promise<MeResponse> {
    const membership = await users.findMembershipByUserId(prisma, userId);
    // Sign-up always creates a membership, so this is a corrupt account: refuse, don't guess.
    if (!membership) throw new AppError(401, "UNAUTHENTICATED", "Not signed in");
    return toMe({ user, workspace: membership.workspace, role: membership.role });
  }

  return {
    /** FR-AUTH-01..03, 06, 07. */
    async signup(input: SignupBody): Promise<AuthResult> {
      const passwordHash = await hashPassword(input.password);
      let created;
      try {
        created = await prisma.$transaction(async (tx) => {
          const user = await users.createUser(tx, {
            email: input.email,
            passwordHash,
            displayName: input.displayName,
          });
          const workspace = await users.createWorkspace(tx, `${input.displayName}'s workspace`);
          await users.createOwnerMembership(tx, workspace.id, user.id);
          return { user, workspace };
        });
      } catch (error) {
        if (isEmailUniqueViolation(error)) throw emailTaken();
        throw error;
      }
      const token = await startSession(prisma, created.user.id);
      return { me: toMe({ ...created, role: "OWNER" }), token };
    },

    /** FR-AUTH-04, 06. `currentToken` is the caller's existing cookie, if any. */
    async login(input: LoginBody, currentToken: string | undefined): Promise<AuthResult> {
      const user = await users.findUserByEmail(prisma, input.email);
      // One password check either way, so response time does not reveal whether the email exists.
      const ok = user
        ? await verifyPassword(user.passwordHash, input.password)
        : await verifyAgainstDummy(input.password);
      if (!user || !ok) throw invalidCredentials();

      // Look up the account first, then swap sessions atomically: a failure leaves the caller's
      // old session intact and never leaves a live session whose cookie was not sent.
      const me = await loadMe(user.id, user);
      const token = await prisma.$transaction(async (tx) => {
        if (currentToken) await sessions.deleteSessionByTokenHash(tx, hashToken(currentToken));
        return startSession(tx, user.id);
      });
      return { me, token };
    },

    /** Resolves a raw cookie token to a live session; null when unknown or expired. */
    async authenticate(token: string): Promise<{ sessionId: string; userId: string } | null> {
      const session = await sessions.findActiveSession(prisma, hashToken(token), new Date());
      return session ? { sessionId: session.id, userId: session.userId } : null;
    },

    /** FR-AUTH-08. */
    async logout(sessionId: string): Promise<void> {
      await sessions.deleteSessionById(prisma, sessionId);
    },

    /** FR-AUTH-09. */
    async me(userId: string): Promise<MeResponse> {
      const user = await users.findUserById(prisma, userId);
      if (!user) throw new AppError(401, "UNAUTHENTICATED", "Not signed in");
      return loadMe(userId, user);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
