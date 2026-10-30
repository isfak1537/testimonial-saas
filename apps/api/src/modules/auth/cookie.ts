import type { CookieOptions, Response } from "express";

export const SESSION_COOKIE = "sid";

interface CookieConfig {
  APP_ORIGIN: string;
  SESSION_TTL_DAYS: number;
}

/** `Secure` only when the app is served over https, so local http dev and Docker still work. */
function baseOptions(config: CookieConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: config.APP_ORIGIN.startsWith("https:"),
  };
}

export function setSessionCookie(res: Response, config: CookieConfig, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    ...baseOptions(config),
    maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response, config: CookieConfig): void {
  res.clearCookie(SESSION_COOKIE, baseOptions(config));
}
