import type { Ref } from "react";

interface ErrorBannerProps {
  message: string | null;
  ref?: Ref<HTMLDivElement>;
}

/** Errors that belong to no field. Focusable so it can receive focus after a failed submit. */
export function ErrorBanner({ message, ref }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <div role="alert" tabIndex={-1} ref={ref} className="error-banner">
      {message}
    </div>
  );
}
