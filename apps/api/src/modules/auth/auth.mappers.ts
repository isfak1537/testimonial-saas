import type { MeResponse } from "@testimonial-saas/shared";

interface MeSource {
  user: { id: string; email: string; displayName: string };
  workspace: { id: string; name: string };
  role: "OWNER";
}

/** Allowlist mapper: never spread a Prisma row into a response (it would leak `passwordHash`). */
export function toMe({ user, workspace, role }: MeSource): MeResponse {
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    workspace: { id: workspace.id, name: workspace.name },
    role,
  };
}
