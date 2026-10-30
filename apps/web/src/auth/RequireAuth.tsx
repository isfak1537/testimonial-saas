import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./auth-context";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === "loading")
    return (
      <p role="status" className="page-status">
        Loading…
      </p>
    );
  if (state.status === "anonymous") {
    return (
      <Navigate to="/login" replace state={state.message ? { message: state.message } : null} />
    );
  }
  return children;
}
