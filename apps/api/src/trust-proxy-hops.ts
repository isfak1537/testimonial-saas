import { z } from "zod";

export const MAX_TRUST_PROXY_HOPS = 10;

const message =
  "TRUST_PROXY_HOPS must be the whole number of reverse proxies in front of the app (0 = none, " +
  `max ${MAX_TRUST_PROXY_HOPS}). "true", "*" and address lists are not accepted: they let clients ` +
  "spoof their IP with X-Forwarded-For (SEC-07)";

/**
 * Express `trust proxy` as an exact hop count. Digits only, so `true`, `*`, `loopback`, `-1`,
 * `1.5`, `1e1` and the empty string fail at startup. Unset means 0: trust nothing.
 */
export const trustProxyHopsSchema = z
  .string()
  .regex(/^\d+$/, message)
  .transform(Number)
  .pipe(z.number().max(MAX_TRUST_PROXY_HOPS, message))
  .default(0);
