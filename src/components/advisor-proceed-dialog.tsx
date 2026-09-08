import { X, PenLine, Phone, MessageCircle, ArrowRight } from "lucide-react";

export const ADVISOR_PHONE_DISPLAY = "+91 89770 79433";
export const ADVISOR_TEL = "tel:+918977079433";
export const ADVISOR_WHATSAPP = "https://wa.me/918977079433";

export interface AdvisorProceedDialogProps {
  open: boolean;
  onClose: () => void;
  onFillOnYourOwn: () => void;
  title: string;
  subtitle?: string;
  fillDescription?: string;
}

export function AdvisorProceedDialog({
  open,
  onClose,
  onFillOnYourOwn,
  title,
  subtitle,
  fillDescription = "Continue with the online application step by step.",
}: AdvisorProceedDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-elev p-6 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">How would you like to proceed?</div>
            <p className="text-[12px] text-muted-foreground mt-1">
              {subtitle || (
                <>
                  Continue with{" "}
                  <span className="font-medium text-foreground/80">{title}</span>{" "}
                  yourself, or let a Cloudcrest advisor handle the filing for you.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onFillOnYourOwn();
            }}
            className="group w-full flex items-center gap-3 text-left p-4 rounded-xl border border-primary bg-primary/[0.06] ring-focus hover:shadow-card transition-all cursor-pointer"
          >
            <span className="size-10 rounded-lg grid place-items-center gradient-brand text-white shadow-brand shrink-0">
              <PenLine className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                Fill on your own
                <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
              </span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">
                {fillDescription}
              </span>
            </span>
          </button>

          <a
            href={ADVISOR_TEL}
            className="group w-full flex items-center gap-3 text-left p-4 rounded-xl border border-border bg-surface ring-focus hover:border-primary/50 hover:shadow-card transition-all cursor-pointer"
          >
            <span className="size-10 rounded-lg grid place-items-center bg-primary/10 text-primary group-hover:gradient-brand group-hover:text-white transition-all shrink-0">
              <Phone className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Talk to an advisor</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">Call {ADVISOR_PHONE_DISPLAY}</span>
            </span>
          </a>

          <a
            href={`${ADVISOR_WHATSAPP}?text=${encodeURIComponent(`Hi, I'd like help with ${title}.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group w-full flex items-center gap-3 text-left p-4 rounded-xl border border-border bg-surface ring-focus hover:border-primary/50 hover:shadow-card transition-all cursor-pointer"
          >
            <span className="size-10 rounded-lg grid place-items-center bg-success/12 text-success group-hover:bg-success group-hover:text-white transition-all shrink-0">
              <MessageCircle className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Text on WhatsApp</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">Chat on {ADVISOR_PHONE_DISPLAY}</span>
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
