import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Plus, X, Loader2, Send, CheckCircle2, ShieldAlert, User, Clock } from "lucide-react";

const BACKEND = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

// Local status pill (kept here to avoid a circular import with profile.index).
function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-warning/15 text-warning",
    resolved: "bg-success/15 text-success",
    closed: "bg-muted text-muted-foreground",
  };
  return (
    <span className={"text-[10px] mono uppercase tracking-wider px-2 py-1 rounded-md " + (map[status] ?? "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}

function fmt(dateStr?: string | null) {
  if (!dateStr) return "";
  const s = String(dateStr).trim();
  const iso = s.includes(" ") && !s.includes("T") ? s.replace(" ", "T") : s;
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
}

export function SupportTicketsCard() {
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: async () => {
      const res = await fetch(`${BACKEND}/api/tickets/my-tickets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tickets");
      return (await res.json()) as any[];
    },
  });

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <LifeBuoy className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Support tickets</h3>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="text-[12px] font-semibold inline-flex items-center gap-1 px-3 py-1.5 rounded-lg gradient-brand text-white shadow-brand"
        >
          <Plus className="size-3.5" /> New ticket
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : data && data.length > 0 ? (
        <ul className="divide-y divide-border">
          {data.map((t) => (
            <li
              key={t.id}
              onClick={() => setOpenId(t.id)}
              className="px-5 py-3.5 flex items-center gap-3 hover:bg-muted/40 cursor-pointer transition-colors group"
            >
              <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                <LifeBuoy className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{t.subject}</div>
                <div className="text-[11px] text-muted-foreground mono">Ticket #{t.id}</div>
              </div>
              <StatusPill status={t.status} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-8 text-center flex flex-col items-center gap-2">
          <div className="size-11 rounded-full bg-muted grid place-items-center text-muted-foreground">
            <LifeBuoy className="size-5" />
          </div>
          <div className="text-sm font-semibold">No support tickets yet</div>
          <div className="text-[12px] text-muted-foreground max-w-xs">
            Have a question or an issue? Raise a ticket and our team will get back to you.
          </div>
        </div>
      )}

      {creating && <CreateTicketDialog onClose={() => setCreating(false)} />}
      {openId != null && <TicketThreadDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function CreateTicketDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create ticket");
      await queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
      onClose();
    } catch (e: any) {
      setErr(e.message || "Failed to create ticket");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="New support ticket" onClose={onClose}>
      <div className="p-6 space-y-4">
        <div>
          <label className="text-xs font-medium text-foreground/90 block mb-1.5">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Question about my GST registration"
            className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/90 block mb-1.5">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Describe your question or issue in detail…"
            className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus"
          />
        </div>
        {err && (
          <div className="text-xs text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2">
            {err}
          </div>
        )}
      </div>
      <div className="px-6 py-4 border-t border-border bg-muted/20 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors">
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="flex items-center gap-2 px-5 py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand hover:shadow-elev transition-all disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Submit ticket
        </button>
      </div>
    </Dialog>
  );
}

function TicketThreadDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const res = await fetch(`${BACKEND}/api/tickets/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load ticket");
      return await res.json();
    },
  });

  const ticket = data?.ticket;
  const messages: any[] = data?.messages || [];

  return (
    <Dialog
      title={ticket?.subject || "Support ticket"}
      badge={ticket ? <StatusPill status={ticket.status} /> : undefined}
      onClose={onClose}
    >
      <div className="p-6 space-y-4 max-h-[55vh] overflow-y-auto">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          messages.map((m) => {
            const isAdmin = m.senderRole === "Admin";
            return (
              <div key={m.id} className={"flex gap-2.5 " + (isAdmin ? "flex-row-reverse text-right" : "")}>
                <div
                  className={
                    "size-8 rounded-full grid place-items-center shrink-0 " +
                    (isAdmin ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")
                  }
                >
                  {isAdmin ? <ShieldAlert className="size-4" /> : <User className="size-4" />}
                </div>
                <div className="min-w-0 max-w-[80%]">
                  <div className="text-[11px] text-muted-foreground mb-0.5">
                    {isAdmin ? "Support Team" : m.senderName || "You"} · {fmt(m.createdAt)}
                  </div>
                  <div
                    className={
                      "inline-block text-xs leading-relaxed rounded-xl px-3 py-2 whitespace-pre-wrap " +
                      (isAdmin
                        ? "bg-primary/10 border border-primary/20 text-foreground"
                        : "bg-muted border border-border text-foreground")
                    }
                  >
                    {m.message}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-6 py-4 border-t border-border bg-muted/20 text-xs">
        {ticket?.status === "resolved" ? (
          <div className="flex items-center gap-2 text-success font-medium">
            <CheckCircle2 className="size-4" /> This ticket was resolved by the support team.
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="size-4" /> Pending — our support team will respond here.
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Dialog({
  title,
  badge,
  onClose,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in-0 duration-200">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border/80 bg-surface shadow-2xl z-10 animate-in zoom-in-95 duration-200 overflow-hidden my-auto">
        <div className="bg-gradient-to-r from-slate-900 via-navy/95 to-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <h3 className="text-lg font-display font-bold leading-snug truncate">{title}</h3>
            {badge}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
