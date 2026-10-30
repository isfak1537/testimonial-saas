import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { AppError } from "./errors.js";

const AUTH_WINDOW_MS = 15 * 60 * 1000;
const SUBMISSION_WINDOW_MS = 10 * 60 * 1000;

/**
 * FR-AUTH-10. One in-memory bucket per IP shared by sign-up and log-in (mount the same
 * instance on both). No `trust proxy` is configured (SEC-07), so the IP is the socket address.
 */
export function authLimiter(max: number): RequestHandler {
  return rateLimit({
    windowMs: AUTH_WINDOW_MS,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res, next) => {
      const retryAfter = res.getHeader("Retry-After");
      if (retryAfter === undefined) res.setHeader("Retry-After", String(AUTH_WINDOW_MS / 1000));
      next(new AppError(429, "RATE_LIMITED", "Too many attempts, try again later"));
    },
  });
}

/**
 * FR-COL-07. Per-IP bucket for public submissions. Mounted before validation and any database
 * access, so honeypot hits and invalid bodies spend budget too.
 */
export function submissionLimiter(max: number): RequestHandler {
  return rateLimit({
    windowMs: SUBMISSION_WINDOW_MS,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res, next) => {
      const retryAfter = res.getHeader("Retry-After");
      if (retryAfter === undefined)
        res.setHeader("Retry-After", String(SUBMISSION_WINDOW_MS / 1000));
      next(new AppError(429, "RATE_LIMITED", "Too many submissions, try again later"));
    },
  });
}
