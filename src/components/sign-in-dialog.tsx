import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, LogIn } from "lucide-react";

/**
 * Prompt shown when a signed-out visitor tries to start an application.
 * Signing in itself happens on /auth — this just explains why and sends them there
 * with a `next` so they come straight back.
 */
export function SignInDialog({
  open,
  onClose,
  reason,
  next,
}: {
  open: boolean;
  onClose: () => void;
  reason?: string;
  next?: string;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in-up">
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-elev">
        <div className="gradient-hero text-white px-6 py-5 flex items-start justify-between">
          <div>
            <div className="label-eyebrow text-white/70 mb-1">Cloudcrest BM</div>
            <h3 className="text-xl font-display font-semibold leading-tight">
              Sign in to continue
            </h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="p-6 text-center flex flex-col items-center gap-4">
          <div className="size-16 rounded-full bg-primary/12 text-primary grid place-items-center">
            <LogIn className="size-7" />
          </div>
          <p className="text-sm text-muted-foreground max-w-sm">
            {reason ?? "Sign in to continue with your application."}
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => navigate({ to: "/auth", search: next ? { next } : {} })}
              className="px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all"
            >
              Sign in / Sign up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
