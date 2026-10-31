import { createContext, useContext } from "react";
import type { LoginBody, MeResponse, SignupBody } from "@testimonial-saas/shared";

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous"; message?: string }
  | { status: "authenticated"; me: MeResponse };

export interface AuthContextValue {
  state: AuthState;
  login: (body: LoginBody) => Promise<void>;
  signup: (body: SignupBody) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

/** The signed-in user. Only call inside `RequireAuth`. */
export function useMe(): MeResponse {
  const { state } = useAuth();
  if (state.status !== "authenticated") throw new Error("useMe needs an authenticated session");
  return state.me;
}
