import type { ReactNode } from "react";
import { Link } from "react-router";
import { PRODUCT_NAME } from "@testimonial-saas/shared";
import { useAuth, useMe } from "../../auth/auth-context";

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const { logout } = useAuth();
  return (
    <div className="app-shell" data-testid="surface-app">
      <header className="app-header">
        <div className="container app-header-inner">
          <Link to="/app" className="app-brand">
            {PRODUCT_NAME}
          </Link>
          <div className="app-user">
            <span>{me.user.displayName}</span>
            <button type="button" className="button button-secondary" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="container app-main">{children}</main>
    </div>
  );
}
