import { pino } from "pino";

export function createLogger(level: string) {
  return pino({
    level,
    // Never log credentials or tokens, even if a caller passes them in.
    redact: {
      paths: [
        "password",
        "*.password",
        "token",
        "*.token",
        "headers.cookie",
        "headers.authorization",
      ],
      censor: "[redacted]",
    },
  });
}
