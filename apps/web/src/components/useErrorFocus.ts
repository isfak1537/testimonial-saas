import { useEffect, useRef } from "react";

/**
 * After a failed submit (`attempt` increments), focus the error banner if there is one,
 * otherwise the first field marked `aria-invalid`.
 */
export function useErrorFocus(attempt: number) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (attempt === 0) return;
    if (bannerRef.current) {
      bannerRef.current.focus();
      return;
    }
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);
  return { bannerRef, formRef };
}
