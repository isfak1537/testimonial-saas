import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";
import { AppError, notFound, type ErrorCode, type ErrorDetail } from "./errors.js";

interface Envelope {
  error: { code: ErrorCode; message: string; requestId: string; details?: ErrorDetail[] };
}

function envelope(
  res: Parameters<RequestHandler>[1],
  status: number,
  code: ErrorCode,
  message: string,
  details?: ErrorDetail[],
): void {
  const body: Envelope = {
    error: { code, message, requestId: String(res.locals["requestId"]) },
  };
  if (details) body.error.details = details;
  res.status(status).json(body);
}

export const apiNotFound: RequestHandler = (_req, _res, next) => {
  next(notFound("Route not found"));
};

const BODY_PARSER_TYPES = new Set([
  "entity.too.large",
  "entity.parse.failed",
  "encoding.unsupported",
  "charset.unsupported",
  "request.aborted",
  "request.size.invalid",
]);

/** Known body-parser errors only; anything else unexpected stays a 500. */
function isBodyParserError(error: unknown): error is { type: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    BODY_PARSER_TYPES.has((error as { type?: unknown }).type as string)
  );
}

export function errorHandler(fallbackLogger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof AppError) {
      envelope(res, error.status, error.code, error.message, error.details);
      return;
    }
    if (isBodyParserError(error)) {
      const log = (res.locals["log"] as Logger | undefined) ?? fallbackLogger;
      log.warn({ type: error.type }, "rejected request body");
      const tooLarge = error.type === "entity.too.large";
      envelope(
        res,
        400,
        "BAD_REQUEST",
        tooLarge ? "Request body too large" : "Malformed request body",
      );
      return;
    }
    const log = (res.locals["log"] as Logger | undefined) ?? fallbackLogger;
    log.error({ err: error }, "unhandled error");
    envelope(res, 500, "INTERNAL", "Something went wrong");
  };
}

/** Last resort for errors outside /api (static files, sendFile): plain text, never a stack. */
export function fallbackErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const status =
      typeof error?.status === "number" && error.status >= 400 && error.status < 500
        ? error.status
        : 500;
    if (status === 500) {
      const log = (res.locals["log"] as Logger | undefined) ?? logger;
      log.error({ err: error }, "unhandled error");
    }
    res
      .status(status)
      .type("text/plain")
      .send(status === 404 ? "Not found" : "Something went wrong");
  };
}
