import { submitTestimonialBody, type SubmitTestimonialBody } from "@testimonial-saas/shared";
import { Router, type RequestHandler } from "express";
import { validate } from "../../http/validate.js";
import type { PublicService } from "./public.service.js";

/** Mounted at `/public`. No session: every identifier comes from the slug lookup (FR-TEN-03). */
export function publicRoutes(publicService: PublicService, submitLimiter: RequestHandler): Router {
  const router = Router();

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
