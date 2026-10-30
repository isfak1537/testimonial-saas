import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { AppError, type ErrorDetail } from "./errors.js";

interface Schemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Parsed values land on `res.locals.validated` (Express 5 `req.query` is read-only);
 * handlers must read from there, never from the raw request.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const validated: Record<string, unknown> = {};
    const details: ErrorDetail[] = [];
    for (const key of ["params", "query", "body"] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (result.success) {
        validated[key] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ path: issue.path.join("."), message: issue.message });
        }
      }
    }
    if (details.length > 0) {
      next(new AppError(422, "VALIDATION_FAILED", "Validation failed", details));
      return;
    }
    res.locals["validated"] = validated;
    next();
  };
}
