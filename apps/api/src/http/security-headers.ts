import type { RequestHandler } from "express";

const CSP = [
  "default-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "img-src 'self' data:",
].join("; ");

/** SEC-03. HTML-only headers are added when the response turns out to be text/html. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  const writeHead = res.writeHead;
  res.writeHead = function (this: typeof res, ...args: Parameters<typeof writeHead>) {
    const contentType = this.getHeader("Content-Type");
    if (typeof contentType === "string" && contentType.startsWith("text/html")) {
      this.setHeader("X-Frame-Options", "DENY");
      this.setHeader("Content-Security-Policy", CSP);
    }
    return writeHead.apply(this, args);
  } as typeof res.writeHead;
  next();
};
