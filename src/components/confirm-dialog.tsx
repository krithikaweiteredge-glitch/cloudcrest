import { createPortal } from "react-dom";

/**
 * Small branded confirmation modal for irreversible or interrupting actions
 * (e.g. signing out). Rendered through a portal so it sits above sidebars,
 * dropdowns and sticky bars regardless of where it's mounted.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in-up">
      <div className="absolute inset-0 bg-navy/85" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface shadow-elev p-6">
        <h3 className="text-base font-display font-semibold">{title}</h3>
        {message && <p className="mt-1.5 text-sm text-muted-foreground">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={
              "px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all " +
              (destructive
                ? "bg-destructive hover:brightness-110"
                : "gradient-brand shadow-brand hover:shadow-elev")
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
