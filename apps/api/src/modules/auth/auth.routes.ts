import { loginBody, signupBody, type LoginBody, type SignupBody } from "@testimonial-saas/shared";
import { Router, type RequestHandler } from "express";
import type { Config } from "../../config.js";
import { getSession, requireSession } from "../../http/auth-context.js";
import { validate } from "../../http/validate.js";
import type { AuthService } from "./auth.service.js";
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from "./cookie.js";

type RouteConfig = Pick<Config, "APP_ORIGIN" | "SESSION_TTL_DAYS">;

/** `limiter` runs first on sign-up and log-in: before validation, hashing and any database call. */
export function authRoutes(
  auth: AuthService,
  config: RouteConfig,
  limiter: RequestHandler,
): Router {
  const router = Router();
  const needSession = requireSession(auth);

  router.post("/signup", limiter, validate({ body: signupBody }), async (req, res) => {
    const { body } = res.locals["validated"] as { body: SignupBody };
    const current: unknown = req.cookies?.[SESSION_COOKIE];
    const { me, token } = await auth.signup(
      body,
      typeof current === "string" ? current : undefined,
    );
    setSessionCookie(res, config, token);
    res.status(201).json(me);
  });

  router.post("/login", limiter, validate({ body: loginBody }), async (req, res) => {
    const { body } = res.locals["validated"] as { body: LoginBody };
    const current: unknown = req.cookies?.[SESSION_COOKIE];
    const { me, token } = await auth.login(body, typeof current === "string" ? current : undefined);
    setSessionCookie(res, config, token);
    res.json(me);
  });

  router.post("/logout", needSession, async (_req, res) => {
    await auth.logout(getSession(res).sessionId);
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  router.get("/me", needSession, async (_req, res) => {
    res.json(await auth.me(getSession(res).userId));
  });

  return router;
}
