import type { RequestHandler } from "express";
import { AppError } from "./errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * SEC-02: every state-changing request must carry an `Origin` header equal to APP_ORIGIN.
 * A missing header is rejected too: browsers always send Origin on cross-site POSTs.
 */
export function originCheck(appOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || req.headers.origin === appOrigin) {
      next();
      return;
    }
    next(new AppError(403, "FORBIDDEN", "Request origin not allowed"));
  };
}
