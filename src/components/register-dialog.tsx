import { useRef, useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, UploadCloud, FileText, CheckCircle2, Trash2, ShieldCheck, Send, Loader2, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type UploadedFile = { file: File; name: string; size: number };

export function RegisterDialog({
  open,
  onClose,
  serviceSlug,
  serviceTitle,
  authority,
  form,
  documents,
}: {
  open: boolean;
  onClose: () => void;
  serviceSlug: string;
  serviceTitle: string;
  authority: string;
  form?: string;
  documents: string[];
}) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refNo, setRefNo] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Prefill from profile
  useEffect(() => {
    if (!open || !user) return;
    setEmail(user.email ?? "");
    setPhone(user.phone ?? "");
    fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/profiles/me`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          const businessRecord = data.businesses?.[0] || {};
          setName((n) => n || `${data.user?.firstName || ""} ${data.user?.lastName || ""}`.trim());
          setBusiness((b) => b || businessRecord.businessName || "");
          setPhone((p) => p || data.user?.phone || "");
        }
      })
      .catch((err) => console.error("Error prefilling form profile:", err));
  }, [open, user]);

  if (!open) return null;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list).map((f) => ({ file: f, name: f.name, size: f.size }))]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      navigate({ to: "/auth", search: { next: `/m/${serviceSlug}` } });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceSlug,
          serviceTitle,
          authority,
          form,
          businessName: business || null,
          contactName: name,
          contactEmail: email,
          contactPhone: phone,
          notes: notes || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit application");
      }

      const req = await response.json();

      // Upload files
      for (const f of files) {
        const formData = new FormData();
        formData.append("file", f.file);

        const docRes = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/${req.id}/documents`, {
          method: "POST",
          body: formData,
        });

        if (!docRes.ok) {
          const docErr = await docRes.json();
          throw new Error(docErr.error || `Failed to upload document ${f.name}`);
        }
      }

      setRefNo(req.referenceNo);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setSubmitted(false);
    setName(""); setBusiness(""); setEmail(""); setPhone(""); setNotes(""); setFiles([]); setError(null);
    onClose();
  };

  const goSignIn = () => {
    onClose();
    navigate({ to: "/auth", search: { next: `/m/${serviceSlug}` } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in-up">
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={reset} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-surface shadow-elev flex flex-col">
        <div className="gradient-hero text-white px-6 py-5 flex items-start justify-between">
          <div>
            <div className="label-eyebrow text-white/70 mb-1">
              Register · {authority}{form ? ` · ${form}` : ""}
            </div>
            <h3 className="text-xl font-display font-semibold leading-tight">{serviceTitle}</h3>
          </div>
          <button onClick={reset} className="text-white/70 hover:text-white"><X className="size-5" /></button>
        </div>

        {!authLoading && !user ? (
          <div className="p-10 text-center flex flex-col items-center gap-4">
            <div className="size-16 rounded-full bg-primary/12 text-primary grid place-items-center">
              <LogIn className="size-7" />
            </div>
            <div>
              <h4 className="text-lg font-semibold">Sign in to continue</h4>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Create a free Cloudcrest BM account to submit your {serviceTitle} application and track it in your dashboard.
              </p>
            </div>
            <button onClick={goSignIn} className="mt-2 px-6 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand flex items-center gap-2">
              <LogIn className="size-4" /> Sign in / Sign up
            </button>
          </div>
        ) : submitted ? (
          <div className="p-10 text-center flex flex-col items-center gap-4">
            <div className="size-16 rounded-full bg-success/15 text-success grid place-items-center">
              <CheckCircle2 className="size-8" />
            </div>
            <div>
              <h4 className="text-lg font-semibold">Application received</h4>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Reference <span className="mono text-foreground font-semibold">{refNo}</span>. A Cloudcrest BM associate will call {phone} within 2 business hours.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={reset} className="px-4 py-2.5 rounded-lg border border-border text-sm">Close</button>
              <button onClick={() => { onClose(); navigate({ to: "/profile/requests" }); }} className="px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand">
                View my registrations
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldLabel label="Full name">
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma" className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
              </FieldLabel>
              <FieldLabel label="Business name">
                <input value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Acme Pvt Ltd" className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
              </FieldLabel>
              <FieldLabel label="Email">
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.in" className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
              </FieldLabel>
              <FieldLabel label="Mobile">
                <input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98xxx xxxxx" className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
              </FieldLabel>
            </div>

            <FieldLabel label="Anything we should know?">
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="State of operation, urgency, prior filings, etc." className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
            </FieldLabel>

            <div className="rounded-xl border border-border bg-panel p-4">
              <div className="label-eyebrow text-primary mb-2">Documents required</div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
                {documents.map((d) => (
                  <li key={d} className="text-[12px] flex items-start gap-2">
                    <span className="mt-1 size-1.5 rounded-full bg-primary/60 shrink-0" />
                    <span className="text-foreground/80">{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 cursor-pointer transition-colors p-6 text-center"
            >
              <UploadCloud className="size-8 text-primary mx-auto mb-2" />
              <div className="text-sm font-medium">Drop files here or click to upload</div>
              <div className="text-[11px] text-muted-foreground mt-1">PDF, JPG, PNG · up to 10 MB each</div>
              <input ref={inputRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            </div>

            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs rounded-md border border-border bg-surface px-3 py-2">
                    <FileText className="size-3.5 text-primary" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="mono text-[10px] text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground border-t border-border pt-4">
              <ShieldCheck className="size-3.5 text-success" />
              Your documents are encrypted and shared only with your Cloudcrest BM advisor.
            </div>

            {error && (
              <div className="text-[12px] text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={reset} className="px-4 py-2.5 rounded-lg text-sm border border-border hover:bg-muted">Cancel</button>
              <button type="submit" disabled={submitting} className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand disabled:opacity-60">
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Submit application
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-eyebrow mb-1.5">{label}</div>
      {children}
    </div>
  );
}
