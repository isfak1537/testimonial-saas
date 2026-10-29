import type { ReactNode } from "react";
import { Link } from "react-router";
import { PRODUCT_NAME } from "@testimonial-saas/shared";

interface PlaceholderPageProps {
  testId: string;
  title: string;
  children: ReactNode;
}

/** Simple page for surfaces that later increments will build out. */
export function PlaceholderPage({ testId, title, children }: PlaceholderPageProps) {
  return (
    <main className="placeholder-page" data-testid={testId}>
      <div className="placeholder-card">
        <Link to="/" className="placeholder-brand">
          {PRODUCT_NAME}
        </Link>
        <h1>{title}</h1>
        {children}
        <Link to="/">Back to home</Link>
      </div>
    </main>
  );
}
