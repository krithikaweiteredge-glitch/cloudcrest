import { useState } from "react";
import { MessageCircleQuestion, LifeBuoy, X, Send, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const BACKEND = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

/**
 * Floating support button. Click the circle to open a small panel and raise a
 * support ticket — it POSTs to /api/tickets, which lands in the admin console's
 * "All Support Tickets" view. Signed-out visitors are prompted to sign in.
 */
export function SupportFab() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setSubject("");
    setMessage("");
    setErr(null);
    setSent(false);
  };

  // The support widget is only for signed-in customers — a signed-out visitor
  // has no account to attach a ticket to.
  if (!user) return null;

  const submit = async () => {
    setErr(null);
    if (!subject.trim() || !message.trim()) {
      setErr("Please enter a subject and a message.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND}/api/tickets`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not send your ticket");
      setSent(true);
      setSubject("");
      setMessage("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-80 rounded-2xl border border-border bg-surface shadow-elev overflow-hidden animate-in-up">
          <div className="gradient-hero text-white px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LifeBuoy className="size-4 text-primary" />
              <span className="text-sm font-semibold">Support</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close support"
              className="text-white/70 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="p-4">
            {sent ? (
              <div className="text-center py-4 flex flex-col items-center gap-3">
                <div className="size-11 rounded-full bg-success/15 text-success grid place-items-center">
                  <CheckCircle2 className="size-6" />
                </div>
                <p className="text-sm font-medium">Ticket sent</p>
                <p className="text-[12px] text-muted-foreground">
                  Our team will get back to you. You can track it under My Account → Support.
                </p>
                <button
                  onClick={reset}
                  className="text-xs text-primary font-semibold hover:underline"
                >
                  Raise another
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[12px] text-muted-foreground">
                  Have a question or an issue? Send us a ticket and we'll reply.
                </p>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm ring-focus"
                />
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Describe your issue…"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm ring-focus resize-none"
                />
                {err && <div className="text-[12px] text-destructive">{err}</div>}
                <button
                  onClick={submit}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Send ticket
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating circle */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support" : "Open support"}
        className="fixed bottom-5 right-4 sm:right-6 z-50 size-14 rounded-full gradient-brand text-white shadow-elev grid place-items-center hover:scale-105 active:scale-95 transition-transform"
      >
        {open ? <X className="size-6" /> : <MessageCircleQuestion className="size-7" />}
      </button>
    </>
  );
}
