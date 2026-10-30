export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "EMAIL_TAKEN"
  | "SLUG_TAKEN"
  | "INVALID_STATE"
  | "CONSENT_VERSION_OUTDATED"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface ErrorDetail {
  path: string;
  message: string;
}

/** The only error type services throw on purpose; the error handler builds the envelope from it. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message = "Bad request"): AppError =>
  new AppError(400, "BAD_REQUEST", message);

export const notFound = (message = "Not found"): AppError =>
  new AppError(404, "NOT_FOUND", message);
