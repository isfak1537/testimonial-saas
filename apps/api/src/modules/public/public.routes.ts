import {
  submitTestimonialBody,
  wallQuery,
  type SubmitTestimonialBody,
  type WallQuery,
} from "@testimonial-saas/shared";
import { Router, type RequestHandler } from "express";
import { validate } from "../../http/validate.js";
import type { PublicService } from "./public.service.js";

/** Mounted at `/public`. No session: every identifier comes from the slug lookup (FR-TEN-03). */
export function publicRoutes(
  publicService: PublicService,
  submitLimiter: RequestHandler,
  wallLimiter: RequestHandler,
): Router {
  const router = Router();

  // FR-WALL-04. Set before the limiter so 404, 422 and 429 are readable cross-origin too. No
  // credentials are ever allowed: the Wall is anonymous data.
  router.get(
    "/spaces/:slug/wall",
    (_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store");
      next();
    },
    wallLimiter,
    validate({ query: wallQuery }),
    async (req, res) => {
      const { query } = res.locals["validated"] as { query: WallQuery };
      res.json(await publicService.getWall(String(req.params["slug"]), query));
    },
  );

  router.get("/spaces/:slug/form", async (req, res) => {
    res.json(await publicService.getForm(String(req.params["slug"])));
  });

  // Limiter first: it runs before validation and any database access (FR-COL-07).
  router.post(
    "/spaces/:slug/testimonials",
    submitLimiter,
    validate({ body: submitTestimonialBody }),
    async (req, res) => {
      const { body } = res.locals["validated"] as { body: SubmitTestimonialBody };
      res.status(201).json(await publicService.submit(String(req.params["slug"]), body));
    },
  );

  return router;
}
