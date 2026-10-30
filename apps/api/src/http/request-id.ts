import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

/** Always generates its own ID: client-supplied values are never trusted or logged. */
export const requestId: RequestHandler = (_req, res, next) => {
  const id = randomUUID();
  res.locals["requestId"] = id;
  res.setHeader("X-Request-Id", id);
  next();
};
