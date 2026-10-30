import type {
  CreateSpaceBody,
  ListSpacesQuery,
  SpaceDto,
  SpaceListResponse,
  UpdateSpaceBody,
} from "@testimonial-saas/shared";
import type { Db } from "../../db/types.js";
import { isUniqueViolationOn } from "../../db/unique-violation.js";
import { AppError, notFound } from "../../http/errors.js";
import { toPage } from "../../http/pagination.js";
import { toSpace } from "./spaces.mappers.js";
import * as spaces from "./spaces.repo.js";

const slugTaken = () =>
  new AppError(409, "SLUG_TAKEN", "This slug is already in use", [
    { path: "slug", message: "Already in use" },
  ]);

export function createSpacesService(db: Db) {
  async function getOrThrow(workspaceId: string, id: string): Promise<SpaceDto> {
    const row = await spaces.findSpace(db, workspaceId, id);
    if (!row) throw notFound();
    return toSpace(row);
  }

  return {
    /** FR-SPACE-04. */
    async list(workspaceId: string, query: ListSpacesQuery): Promise<SpaceListResponse> {
      const rows = await spaces.listSpaces(db, workspaceId, query);
      const page = toPage(rows, query.limit);
      return { items: page.items.map(toSpace), nextCursor: page.nextCursor };
    },

    get: getOrThrow,

    /** FR-SPACE-01..03. Uniqueness is enforced by the database, so there is no check-then-insert race. */
    async create(workspaceId: string, input: CreateSpaceBody): Promise<SpaceDto> {
      try {
        return toSpace(await spaces.createSpace(db, workspaceId, input));
      } catch (error) {
        if (isUniqueViolationOn(error, "slug")) throw slugTaken();
        throw error;
      }
    },

    /** FR-SPACE-04. Archived Spaces are read-only: 409, but only after proving it is this tenant's. */
    async update(workspaceId: string, id: string, input: UpdateSpaceBody): Promise<SpaceDto> {
      let count: number;
      try {
        count = await spaces.updateActiveSpace(db, workspaceId, id, input);
      } catch (error) {
        if (isUniqueViolationOn(error, "slug")) throw slugTaken();
        throw error;
      }
      if (count === 0) await throwNotFoundOrArchived(workspaceId, id);
      return getOrThrow(workspaceId, id);
    },

    /** FR-SPACE-05. Idempotent: archiving an archived Space is a 200 that changes nothing. */
    async archive(workspaceId: string, id: string): Promise<SpaceDto> {
      await spaces.archiveActiveSpace(db, workspaceId, id, new Date());
      return getOrThrow(workspaceId, id);
    },
  };

  async function throwNotFoundOrArchived(workspaceId: string, id: string): Promise<never> {
    const row = await spaces.findSpace(db, workspaceId, id);
    if (!row) throw notFound();
    throw new AppError(409, "INVALID_STATE", "Archived Spaces cannot be edited");
  }
}

export type SpacesService = ReturnType<typeof createSpacesService>;
