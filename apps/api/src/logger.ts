import { pino, type DestinationStream, type Logger } from "pino";

// SEC-04. pino wildcards match one path segment, so nesting is listed explicitly.
const SENSITIVE_KEYS = [
  "cookie",
  "set-cookie",
  "authorization",
  "password",
  "passwordHash",
  "authorEmail",
  "token",
  "tokenHash",
  "sessionToken",
  "sessionId",
  "sid",
];
// Header names are case-sensitive in pino paths, so common capitalisations are listed too.
const HEADER_CASE_VARIANTS = ["Cookie", "Set-Cookie", "Authorization"];
const PREFIXES = [
  "",
  "*.",
  "*.*.",
  "*.*.*.",
  "headers.",
  "req.headers.",
  "res.headers.",
  "*.headers.",
  "req.body.",
  "body.",
];
const REDACT_PATHS = PREFIXES.flatMap((prefix) =>
  [...SENSITIVE_KEYS, ...HEADER_CASE_VARIANTS].map((key) =>
    /^[a-z]+$/i.test(key) ? `${prefix}${key}` : `${prefix}["${key}"]`,
  ),
);

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      // Never log credentials, tokens or author emails, even if a caller passes them in.
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    },
    destination,
  );
}
