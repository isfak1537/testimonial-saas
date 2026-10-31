import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Outlet, useNavigate } from "react-router";
import type { LoginBody, SignupBody } from "@testimonial-saas/shared";
import { api, onUnauthorized } from "../api/client";
import { AuthContext, type AuthContextValue, type AuthState } from "./auth-context";

export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please log in again.";

function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    api
      .getMe()
      .then((me) => {
        if (!cancelled) setState({ status: "authenticated", me });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "anonymous" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 while signed in means the session ended. The boot-time /auth/me 401 is not that.
  useEffect(() => {
    onUnauthorized(() => {
      if (stateRef.current.status !== "authenticated") return;
      // RequireAuth redirects to /login and carries the message along.
      setState({ status: "anonymous", message: SESSION_EXPIRED_MESSAGE });
    });
    return () => onUnauthorized(null);
  }, []);

  const login = useCallback(async (body: LoginBody) => {
    setState({ status: "authenticated", me: await api.login(body) });
  }, []);

  const signup = useCallback(async (body: SignupBody) => {
    setState({ status: "authenticated", me: await api.signup(body) });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // The session is treated as ended locally either way.
    }
    setState({ status: "anonymous" });
    void navigate("/login", { replace: true });
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, signup, logout }),
    [state, login, signup, logout],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

/** Layout route: only the auth and dashboard routes mount the provider (and call /auth/me). */
export default function AuthLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
