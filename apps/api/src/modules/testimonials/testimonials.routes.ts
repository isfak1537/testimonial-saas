import {
  listTestimonialsQuery,
  testimonialActionBody,
  type ListTestimonialsQuery,
} from "@testimonial-saas/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { notFound } from "../../http/errors.js";
import { getTenant } from "../../http/member-context.js";
import { validate } from "../../http/validate.js";
import type { TestimonialAction } from "./testimonials.repo.js";
import type { TestimonialsService } from "./testimonials.service.js";

const uuid = z.uuid();

/** A malformed id is a 404, like an unknown one (FR-TEN-03). */
function param(req: Request, name: "spaceId" | "testimonialId"): string {
  const id: unknown = req.params[name];
  if (typeof id !== "string" || !uuid.safeParse(id).success) throw notFound();
  return id;
}

/** Runs before body validation so a bad id is always 404, whatever the body says. */
function checkIds(req: Request, _res: unknown, next: (error?: unknown) => void) {
  try {
    param(req, "spaceId");
    if (req.params["testimonialId"] !== undefined) param(req, "testimonialId");
    next();
  } catch (error) {
    next(error);
  }
}

const ACTION_ROUTES: readonly [path: string, action: TestimonialAction][] = [
  ["approve", "approve"],
  ["reject", "reject"],
  ["publish", "publish"],
  ["unpublish", "unpublish"],
  ["withdraw-consent", "withdraw-consent"],
];

/** Mounted at `/spaces/:spaceId/testimonials`, so it inherits requireSession + requireMember. */
export function testimonialsRoutes(testimonials: TestimonialsService): Router {
  const router = Router({ mergeParams: true });

  router.get("/", checkIds, validate({ query: listTestimonialsQuery }), async (req, res) => {
    const { query } = res.locals["validated"] as { query: ListTestimonialsQuery };
    res.json(await testimonials.list(getTenant(res).workspaceId, param(req, "spaceId"), query));
  });

  router.get("/:testimonialId", checkIds, async (req, res) => {
    res.json(
      await testimonials.get(
        getTenant(res).workspaceId,
        param(req, "spaceId"),
        param(req, "testimonialId"),
      ),
    );
  });

  for (const [path, action] of ACTION_ROUTES) {
    router.post(
      `/:testimonialId/${path}`,
      checkIds,
      validate({ body: testimonialActionBody }),
      async (req, res) => {
        res.json(
          await testimonials.act(
            getTenant(res),
            param(req, "spaceId"),
            param(req, "testimonialId"),
            action,
          ),
        );
      },
    );
  }

  router.delete(
    "/:testimonialId",
    checkIds,
    validate({ body: testimonialActionBody }),
    async (req, res) => {
      await testimonials.act(
        getTenant(res),
        param(req, "spaceId"),
        param(req, "testimonialId"),
        "delete",
      );
      res.status(204).end();
    },
  );

  return router;
}
