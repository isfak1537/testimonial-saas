import {
  createSpaceBody,
  listSpacesQuery,
  updateSpaceBody,
  type CreateSpaceBody,
  type ListSpacesQuery,
  type UpdateSpaceBody,
} from "@testimonial-saas/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { notFound } from "../../http/errors.js";
import { getTenant } from "../../http/member-context.js";
import { validate } from "../../http/validate.js";
import type { TestimonialsService } from "../testimonials/testimonials.service.js";
import { testimonialsRoutes } from "../testimonials/testimonials.routes.js";
import type { SpacesService } from "./spaces.service.js";

const uuid = z.uuid();

/**
 * Mounted behind requireSession + requireMember. A malformed `:spaceId` is a 404, not a 422:
 * an id that cannot exist looks exactly like one that is not yours.
 */
function spaceId(req: Request): string {
  const id: unknown = req.params["spaceId"];
  if (typeof id !== "string" || !uuid.safeParse(id).success) throw notFound();
  return id;
}

export function spacesRoutes(spaces: SpacesService, testimonials: TestimonialsService): Router {
  const router = Router({ mergeParams: true });
  // Nested here so testimonial routes stay on the shared `tenant` router (§3.2).
  router.use("/:spaceId/testimonials", testimonialsRoutes(testimonials));

  router.get("/", validate({ query: listSpacesQuery }), async (_req, res) => {
    const { query } = res.locals["validated"] as { query: ListSpacesQuery };
    res.json(await spaces.list(getTenant(res).workspaceId, query));
  });

  router.post("/", validate({ body: createSpaceBody }), async (_req, res) => {
    const { body } = res.locals["validated"] as { body: CreateSpaceBody };
    res.status(201).json(await spaces.create(getTenant(res).workspaceId, body));
  });

  router.get("/:spaceId", async (req, res) => {
    res.json(await spaces.get(getTenant(res).workspaceId, spaceId(req)));
  });

  // The id is checked before the body so a bad id is always 404, whatever the body says.
  router.patch(
    "/:spaceId",
    (req, _res, next) => {
      try {
        spaceId(req);
        next();
      } catch (error) {
        next(error);
      }
    },
    validate({ body: updateSpaceBody }),
    async (req, res) => {
      const { body } = res.locals["validated"] as { body: UpdateSpaceBody };
      res.json(await spaces.update(getTenant(res).workspaceId, spaceId(req), body));
    },
  );

  router.post("/:spaceId/archive", async (req, res) => {
    res.json(await spaces.archive(getTenant(res).workspaceId, spaceId(req)));
  });

  return router;
}
