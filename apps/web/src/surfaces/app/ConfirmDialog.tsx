import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  title: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

/** A modal `<dialog>`: the browser traps focus and Escape cancels. Cancel is focused first. */
export function ConfirmDialog({
  title,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={onCancel}
    >
      <h2 id="confirm-title">{title}</h2>
      {children}
      <div className="form-actions">
        <button type="button" className="button button-secondary" autoFocus onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button button-danger" disabled={busy} onClick={onConfirm}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
