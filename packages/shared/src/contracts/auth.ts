import { z } from "zod";

// SRS FR-AUTH-01. Email is normalised before it is validated, so " Ada@Example.COM " is accepted.
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

// Bodies are strict: unknown keys (workspaceId, role, ...) give 422 rather than being ignored.
export const signupBody = z.strictObject({
  email,
  password: z.string().min(10).max(128),
  displayName: z.string().trim().min(1).max(80),
});

// Log-in only bounds the length; the 10-character rule applies to new passwords.
export const loginBody = z.strictObject({
  email,
  password: z.string().min(1).max(128),
});

export type SignupBody = z.infer<typeof signupBody>;
export type LoginBody = z.infer<typeof loginBody>;

/** Response of sign-up, log-in and `GET /auth/me` (FR-AUTH-09). */
export interface MeResponse {
  user: { id: string; email: string; displayName: string };
  workspace: { id: string; name: string };
  role: "OWNER";
}
