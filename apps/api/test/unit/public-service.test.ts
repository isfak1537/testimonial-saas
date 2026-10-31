import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { AppError } from "../../src/http/errors.js";
import { createPublicService } from "../../src/modules/public/public.service.js";

const space = { id: "s", workspaceId: "w", name: "Acme", headline: "h", message: "", prompts: [] };

describe("public service store failure", () => {
  it("replaces a database error with a bare INTERNAL AppError", async () => {
    const db = {
      space: { findFirst: async () => space },
      testimonial: {
        create: async () => {
          throw new Error("Invalid invocation: authorEmail: secret.person@example.com");
        },
      },
    } as unknown as PrismaClient;
    const error = await createPublicService(db)
      .submit("acme", {
        authorName: "Ada",
        rating: 5,
        content: "Great product, would recommend.",
        consent: true,
        consentVersion: "2026-10-30.v1",
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(500);
    expect(JSON.stringify(error)).not.toContain("secret.person");
    expect((error as AppError).message).not.toContain("secret.person");
  });
});
