import type { RequestHandler, Response } from "express";
import type { AuthService } from "../modules/auth/auth.service.js";
import { SESSION_COOKIE } from "../modules/auth/cookie.js";
import { AppError } from "./errors.js";

export interface SessionContext {
  userId: string;
  sessionId: string;
}

const KEY = "session";

/** §3.2: loads the session behind the `sid` cookie. Missing, unknown or expired → 401. */
export function requireSession(auth: Pick<AuthService, "authenticate">): RequestHandler {
  return async (req, res, next) => {
    try {
      const token: unknown = req.cookies?.[SESSION_COOKIE];
      const session = typeof token === "string" && token ? await auth.authenticate(token) : null;
      if (!session) {
        next(new AppError(401, "UNAUTHENTICATED", "Not signed in"));
        return;
      }
      res.locals[KEY] = session satisfies SessionContext;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Only valid behind `requireSession`. */
export function getSession(res: Response): SessionContext {
  return res.locals[KEY] as SessionContext;
}
