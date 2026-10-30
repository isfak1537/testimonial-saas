import request from "supertest";
import { post, sessionToken, signupBody } from "./auth-app.js";

export interface TestUser {
  token: string;
  workspaceId: string;
}

/** Signs up through the real API and returns the session token and the user's workspace id. */
export async function signupUser(
  app: Parameters<typeof request>[0],
  email: string,
): Promise<TestUser> {
  const res = await post(app, "/api/v1/auth/signup").send(signupBody({ email }));
  const token = sessionToken(res);
  if (res.status !== 201 || !token) throw new Error(`sign-up failed: ${res.status}`);
  return { token, workspaceId: res.body.workspace.id as string };
}
