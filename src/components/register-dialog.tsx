import { useRef, useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, UploadCloud, FileText, CheckCircle2, Trash2, ShieldCheck, Send, Loader2, LogIn, Download, Users, Coins, FolderLock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type UploadedFile = { file: File; name: string; size: number };
type VaultDoc = { id: number; name: string; sizeBytes?: number | null };

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

export function RegisterDialog({
  open,
  onClose,
  serviceSlug,
  serviceTitle,
  authority,
  form,
  documents,
  initialEmail,
  initialPhone,
  capital,
  paidCapital,
  formData,
  fees,
  feeTotal,
}: {
  open: boolean;
  onClose: () => void;
  serviceSlug: string;
  serviceTitle: string;
  authority: string;
  form?: string;
  documents: string[];
  /** Contact details already collected by a wizard, used to prefill the form. */
  initialEmail?: string;
  initialPhone?: string;
  /** Capital figures from the incorporation wizards, filed with the request. */
  capital?: number;
  paidCapital?: number;
  /** Everything else the wizard collected, stored verbatim on the request. */
  formData?: Record<string, unknown>;
  /** Resolved fee lines + total, printed on the summary PDF. */
  fees?: { label: string; amount: number }[];
  feeTotal?: number;
}) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [notes, setNotes] = useState("");
  const [partners, setPartners] = useState("");
  const [totalCapital, setTotalCapital] = useState(capital ? String(capital) : "");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  // Whether the device uploads should also be saved to the reusable vault.
  const [saveToVault, setSaveToVault] = useState(true);
  // The user's existing vault documents, and which ones they've picked to attach.
  const [vaultDocs, setVaultDocs] = useState<VaultDoc[]>([]);
  const [selectedVaultIds, setSelectedVaultIds] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refNo, setRefNo] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Prefill from profile. Anything the wizard already collected wins, so the
  // account address never clobbers what the customer just typed.
  useEffect(() => {
    if (!open || !user) return;
    setEmail((e) => e || user.email || "");
    setPhone((p) => p || user.phone || "");
    fetch(`${BACKEND_URL}/api/profiles/me`, { credentials: "include" })
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

  // Load the user's Document Vault so they can attach existing files.
  useEffect(() => {
    if (!open || !user) return;
    fetch(`${BACKEND_URL}/api/requests/documents`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: VaultDoc[]) => setVaultDocs(Array.isArray(data) ? data : []))
      .catch(() => setVaultDocs([]));
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
      // Fold the manually-entered partners / capital into the stored form data
      // alongside anything a wizard already collected.
      const mergedFormData = {
        ...(formData ?? {}),
        ...(partners ? { partners: Number(partners) } : {}),
        ...(totalCapital ? { totalCapital: Number(totalCapital) } : {}),
      };

      const response = await fetch(`${BACKEND_URL}/api/requests`, {
        method: "POST",
        credentials: "include",
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
          authorisedCapital: capital ?? (totalCapital ? Number(totalCapital) : null),
          paidCapital: paidCapital ?? null,
          formData: Object.keys(mergedFormData).length ? mergedFormData : null,
          // Snapshot the exact fee breakdown so the order summary PDF reprints
          // the real fees the customer saw, not a placeholder estimate.
          fees: fees ?? [],
          total: feeTotal ?? null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit application");
      }

      const req = await response.json();

      // Device uploads. When "save to vault" is on, send them to the vault (so
      // they're reusable) and link them to this request; otherwise attach them to
      // the request only.
      if (files.length > 0) {
        if (saveToVault) {
          const vaultForm = new FormData();
          files.forEach((f) => vaultForm.append("file", f.file));
          const vaultRes = await fetch(`${BACKEND_URL}/api/requests/vault`, {
            method: "POST",
            credentials: "include",
            body: vaultForm,
          });
          if (!vaultRes.ok) {
            const e = await vaultRes.json();
            throw new Error(e.error || "Failed to save documents to your vault");
          }
          const { documents: savedVaultDocs } = await vaultRes.json();
          const newIds = (savedVaultDocs ?? []).map((d: VaultDoc) => d.id);
          await fetch(`${BACKEND_URL}/api/requests/${req.id}/link-vault-docs`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ docIds: newIds }),
          });
        } else {
          for (const f of files) {
            const upload = new FormData();
            upload.append("file", f.file);
            const docRes = await fetch(`${BACKEND_URL}/api/requests/${req.id}/documents`, {
              method: "POST",
              credentials: "include",
              body: upload,
            });
            if (!docRes.ok) {
              const docErr = await docRes.json();
              throw new Error(docErr.error || `Failed to upload document ${f.name}`);
            }
          }
        }
      }

      // Attach any documents the user picked from their existing vault.
      if (selectedVaultIds.length > 0) {
        await fetch(`${BACKEND_URL}/api/requests/${req.id}/link-vault-docs`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docIds: selectedVaultIds }),
        });
      }

      setRefNo(req.referenceNo);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // Generate a filing summary PDF from what's on the form and save it to the
  // device. Works before submitting — no request id needed.
  const downloadSummary = async () => {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/requests/summary/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: serviceTitle,
          form,
          authority,
          capital: totalCapital ? Number(totalCapital) : capital ?? undefined,
          documents,
          // The admin-configured fee lines + total so the PDF shows exact fees.
          fees: fees ?? [],
          total: feeTotal,
          ...(partners ? { partners: Number(partners) } : {}),
          ...(formData ?? {}),
        }),
      });
      if (!res.ok) throw new Error("Could not generate the summary PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${serviceTitle.replace(/\s+/g, "-")}-Summary.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to download summary");
    } finally {
      setDownloading(false);
    }
  };

  const reset = () => {
    setSubmitted(false);
    setName(""); setBusiness(""); setEmail(""); setPhone(""); setNotes("");
    setPartners(""); setTotalCapital(capital ? String(capital) : "");
    setFiles([]); setSelectedVaultIds([]); setSaveToVault(true); setError(null);
    onClose();
  };

  const toggleVaultDoc = (id: number) =>
    setSelectedVaultIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const goSignIn = () => {
    onClose();
    navigate({ to: "/auth", search: { next: `/m/${serviceSlug}` } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in-up">
      <div className="absolute inset-0 bg-navy/85" onClick={reset} />
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
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={reset} className="px-4 py-2.5 rounded-lg border border-border text-sm">Close</button>
              <button
                onClick={downloadSummary}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-primary/40 text-primary hover:bg-primary/10 transition-colors disabled:opacity-60"
              >
                {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Download summary
              </button>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldLabel label="Number of partners">
                <div className="flex items-center gap-2 bg-input border border-border rounded-lg px-3 focus-within:border-primary/60 transition-colors">
                  <Users className="size-4 text-muted-foreground shrink-0" />
                  <input
                    value={partners}
                    onChange={(e) => setPartners(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    placeholder="e.g. 2"
                    className="w-full bg-transparent py-2.5 text-sm focus:outline-none"
                  />
                </div>
              </FieldLabel>
              <FieldLabel label="Total capital (₹)">
                <div className="flex items-center gap-2 bg-input border border-border rounded-lg px-3 focus-within:border-primary/60 transition-colors">
                  <Coins className="size-4 text-muted-foreground shrink-0" />
                  <input
                    value={totalCapital}
                    onChange={(e) => setTotalCapital(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    placeholder="e.g. 100000"
                    className="w-full bg-transparent py-2.5 text-sm focus:outline-none"
                  />
                </div>
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

            <div className="label-eyebrow text-primary">Upload from device</div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className="-mt-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 cursor-pointer transition-colors p-6 text-center"
            >
              <UploadCloud className="size-8 text-primary mx-auto mb-2" />
              <div className="text-sm font-medium">Drop files here or click to upload</div>
              <div className="text-[11px] text-muted-foreground mt-1">PDF, JPG, PNG · up to 10 MB each</div>
              <input ref={inputRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            </div>

            {files.length > 0 && (
              <>
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

                {/* Whether to keep the freshly uploaded files in the reusable vault. */}
                <label className="flex items-start gap-2.5 rounded-lg border border-border bg-panel/40 px-3.5 py-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveToVault}
                    onChange={(e) => setSaveToVault(e.target.checked)}
                    className="size-4 mt-0.5 accent-[var(--brand)]"
                  />
                  <span className="text-[12px] text-foreground/80 leading-snug">
                    <span className="font-semibold flex items-center gap-1.5">
                      <FolderLock className="size-3.5 text-primary" /> Save these files to my Document Vault
                    </span>
                    Store them once and reuse across future applications. Uncheck to attach them to
                    this application only.
                  </span>
                </label>
              </>
            )}

            {/* Attach from the existing Document Vault */}
            {vaultDocs.length > 0 && (
              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="flex items-center gap-1.5 label-eyebrow text-primary mb-2.5">
                  <FolderLock className="size-3.5" /> Attach from Document Vault
                </div>
                <ul className="space-y-1.5 max-h-44 overflow-y-auto">
                  {vaultDocs.map((d) => {
                    const checked = selectedVaultIds.includes(d.id);
                    return (
                      <li key={d.id}>
                        <label className="flex items-center gap-2.5 text-[13px] rounded-lg border px-3 py-2 cursor-pointer transition-colors border-border hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleVaultDoc(d.id)}
                            className="size-4 accent-[var(--brand)]"
                          />
                          <FileText className="size-3.5 text-primary shrink-0" />
                          <span className="flex-1 truncate">{d.name}</span>
                          {d.sizeBytes ? (
                            <span className="mono text-[10px] text-muted-foreground">
                              {(Number(d.sizeBytes) / 1024).toFixed(0)} KB
                            </span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {selectedVaultIds.length > 0 && (
                  <div className="mt-2 text-[11px] text-primary font-medium">
                    {selectedVaultIds.length} vault document{selectedVaultIds.length > 1 ? "s" : ""} selected
                  </div>
                )}
              </div>
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

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" onClick={reset} className="px-4 py-2.5 rounded-lg text-sm border border-border hover:bg-muted">Cancel</button>
              <button
                type="button"
                onClick={downloadSummary}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-primary/40 text-primary hover:bg-primary/10 transition-colors disabled:opacity-60"
              >
                {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Download summary
              </button>
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
