import express, { type RequestHandler } from "express";
import { badRequest } from "./errors.js";

const NO_BODY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const parseJson = express.json({ limit: "16kb" });

/** JSON only (SRS §5): a body with any other content type is rejected, not ignored. */
export const jsonBody: RequestHandler = (req, _res, next) => {
  const hasBody =
    req.headers["content-type"] !== undefined ||
    req.headers["transfer-encoding"] !== undefined ||
    (req.headers["content-length"] !== undefined && req.headers["content-length"] !== "0");
  if (!NO_BODY_METHODS.has(req.method) && hasBody && !req.is("application/json")) {
    next(badRequest("Content-Type must be application/json"));
    return;
  }
  parseJson(req, _res, next);
};
