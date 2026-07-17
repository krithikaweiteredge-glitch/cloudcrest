import { useRef, useState } from "react";
import { X, UploadCloud, FileText, CheckCircle2, Trash2, ShieldCheck, Send } from "lucide-react";

type UploadedFile = { name: string; size: number };

export function RegisterDialog({
  open,
  onClose,
  serviceTitle,
  authority,
  form,
  documents,
}: {
  open: boolean;
  onClose: () => void;
  serviceTitle: string;
  authority: string;
  form?: string;
  documents: string[];
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const arr: UploadedFile[] = Array.from(list).map((f) => ({ name: f.name, size: f.size }));
    setFiles((prev) => [...prev, ...arr]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const reset = () => {
    setSubmitted(false);
    setName(""); setEmail(""); setPhone(""); setNotes(""); setFiles([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in-up">
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={reset} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-surface shadow-elev flex flex-col">
        {/* Header */}
        <div className="gradient-hero text-white px-6 py-5 flex items-start justify-between">
          <div>
            <div className="label-eyebrow text-white/70 mb-1">Register · {authority}{form ? ` · ${form}` : ""}</div>
            <h3 className="text-xl font-display font-semibold leading-tight">{serviceTitle}</h3>
          </div>
          <button onClick={reset} className="text-white/70 hover:text-white transition-colors">
            <X className="size-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-10 text-center flex flex-col items-center gap-4">
            <div className="size-16 rounded-full bg-success/15 text-success grid place-items-center">
              <CheckCircle2 className="size-8" />
            </div>
            <div>
              <h4 className="text-lg font-semibold">Application received</h4>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                A Cloudcrest BM associate will call {phone || "you"} within 2 business hours to verify documents and begin your {serviceTitle}.
              </p>
            </div>
            <button
              onClick={reset}
              className="mt-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldLabel label="Full name">
                <input required value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Rahul Sharma"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
              </FieldLabel>
              <FieldLabel label="Business name">
                <input placeholder="Acme Pvt Ltd"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
              </FieldLabel>
              <FieldLabel label="Email">
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.in"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
              </FieldLabel>
              <FieldLabel label="Mobile">
                <input required value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98xxx xxxxx"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
              </FieldLabel>
            </div>

            <FieldLabel label="Anything we should know?">
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="State of operation, urgency, prior filings, etc."
                className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
            </FieldLabel>

            {/* Documents checklist */}
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

            {/* Uploader */}
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
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground border-t border-border pt-4">
              <ShieldCheck className="size-3.5 text-success" />
              Your documents are encrypted end-to-end and shared only with your Cloudcrest BM advisor.
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={reset}
                className="px-4 py-2.5 rounded-lg text-sm border border-border hover:bg-muted transition-colors">
                Cancel
              </button>
              <button type="submit"
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all">
                <Send className="size-4" /> Submit application
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
