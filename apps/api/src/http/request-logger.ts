import type { RequestHandler } from "express";
import type { Logger } from "pino";

/** Logs one line per request. Never logs headers, bodies or query strings. */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    const log = logger.child({ requestId: res.locals["requestId"] });
    res.locals["log"] = log;
    let logged = false;
    const onDone = (): void => {
      if (logged) return;
      logged = true;
      log.info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - start) / 1e6,
        },
        "request",
      );
    };
    res.on("finish", onDone);
    res.on("close", onDone);
    next();
  };
}
