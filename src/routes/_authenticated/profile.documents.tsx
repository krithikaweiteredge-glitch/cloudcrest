import { createFileRoute } from "@tanstack/react-router";
import { assetUrl } from "@/lib/file-url";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { FolderLock, FileText, Download, UploadCloud, Loader2, X, CheckCircle2, Send } from "lucide-react";
import { EmptyState } from "./profile.index";
import { BrandLoader } from "@/components/brand-loader";

export const Route = createFileRoute("/_authenticated/profile/documents")({
  component: DocsPage,
});

function parseDocLabel(name: string): { label: string; fileName: string } {
  if (!name) return { label: "Uploaded Document", fileName: "document" };
  const sanitized = name
    .replace(/â[^\s]*/g, " - ")
    .replace(/[^\x20-\x7E]/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

  let rawLabel = "";
  let rawFileName = sanitized;

  if (sanitized.includes(" __FILE__ ")) {
    const parts = sanitized.split(" __FILE__ ");
    rawLabel = parts[0];
    rawFileName = parts.slice(1).join(" __FILE__ ");
  } else if (sanitized.includes(" :: ")) {
    const parts = sanitized.split(" :: ");
    rawLabel = parts[0];
    rawFileName = parts.slice(1).join(" :: ");
  } else if (sanitized.includes(" : ")) {
    const parts = sanitized.split(" : ");
    rawLabel = parts[0];
    rawFileName = parts.slice(1).join(" : ");
  } else if (sanitized.includes(" - ")) {
    const parts = sanitized.split(" - ");
    if (parts.length > 1 && parts[0].length < 40) {
      rawLabel = parts[0];
      rawFileName = parts.slice(1).join(" - ");
    }
  }

  let label = rawLabel.trim() || "Uploaded Document";
  let fileName = rawFileName.replace(/^[-\s]+|[-\s]+$/g, "").trim() || "Uploaded File";
  return { label, fileName };
}

function getRequiredDocumentsForRequest(request: any): string[] {
  if (!request) return [];
  if (request.requiredDocuments && request.requiredDocuments.length > 0) {
    return request.requiredDocuments;
  }
  const title = (request.serviceTitle || "").toLowerCase();
  const form = (request.form || "").toLowerCase();

  if (title.includes("company") || title.includes("incorporation") || form.includes("spice")) {
    return [
      "PAN & Aadhaar of all directors",
      "Passport-size photographs",
      "Address proof (utility bill < 2 mo)",
      "Registered office proof",
      "Rent agreement + NOC (if rented)",
      "Digital Signature Certificate (DSC)",
      "MoA & AoA drafts",
    ];
  }

  if (title.includes("llp") || title.includes("limited liability partnership") || form.includes("fillip")) {
    return [
      "PAN & Aadhaar of all partners",
      "Passport-size photographs",
      "Address proof (utility bill < 2 mo)",
      "Registered office proof",
      "Rent agreement + NOC (if rented)",
      "Digital Signature Certificate (DSC)",
      "LLP Agreement draft",
    ];
  }

  if (title.includes("gst")) {
    return [
      "PAN Card of Entity / Proprietor",
      "Aadhaar Card of Proprietor / Partners / Directors",
      "Business Premises Address Proof",
      "Bank Account Proof (Cancelled Cheque / Passbook)",
      "Owner NOC / Rent Agreement",
    ];
  }

  return [
    "PAN Card of Applicant / Entity",
    "Aadhaar / Photo ID Proof",
    "Address Proof of Premises",
    "Business Registration Proof",
  ];
}

function DocsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedDocForAssign, setSelectedDocForAssign] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-docs"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/documents`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load documents");
      const list = await res.json();
      return list.map((d: any) => ({
        id: d.id,
        name: d.name,
        size_bytes: d.sizeBytes,
        storage_path: d.storagePath,
        created_at: d.createdAt,
        service_requests: d.serviceTitle
          ? {
              service_title: d.serviceTitle,
              reference_no: d.referenceNo,
            }
          : null,
      }));
    },
  });

  const openDoc = (path: string) => {
    window.open(assetUrl(path), "_blank", "noopener");
  };

  const handleVaultUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      for (const f of Array.from(files)) {
        formData.append("file", f);
      }

      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/vault`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to upload file to vault");
      }

      await queryClient.invalidateQueries({ queryKey: ["my-docs"] });
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload document to vault");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-semibold">Documents Vault</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every file you've uploaded, encrypted and searchable across services. Select any document to attach it to an application.
          </p>
        </div>
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand hover:opacity-95 disabled:opacity-60 transition-opacity cursor-pointer"
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
            Upload to Vault
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={handleVaultUpload}
          />
        </div>
      </div>

      {uploadError && (
        <div className="text-xs text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          {uploadError}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
        {isLoading ? (
          <BrandLoader />
        ) : data && data.length > 0 ? (
          <ul className="divide-y divide-border">
            {data.map((d: any) => {
              const parsed = parseDocLabel(d.name);
              return (
                <li key={d.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                      <FileText className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{parsed.fileName || d.name}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-primary/90">{parsed.label}</span>
                        <span>·</span>
                        <span>{d.service_requests?.service_title ?? "Unattached Vault Doc"}</span>
                        {d.size_bytes ? <span>· {(d.size_bytes / 1024).toFixed(0)} KB</span> : null}
                        <span>· Uploaded {new Date(d.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setSelectedDocForAssign(d)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg gradient-brand text-white shadow-brand hover:opacity-95 transition-all inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="size-3" /> Attach to Application
                    </button>
                    <button
                      onClick={() => openDoc(d.storage_path)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="size-3" /> Open
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={FolderLock} title="Vault is empty" body="Documents uploaded during any registration appear here — reuse them across services." />
        )}
      </div>

      {selectedDocForAssign && (
        <AssignVaultDocModal
          doc={selectedDocForAssign}
          onClose={() => setSelectedDocForAssign(null)}
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ["my-requests"] });
            await queryClient.invalidateQueries({ queryKey: ["my-docs"] });
          }}
        />
      )}
    </div>
  );
}

function AssignVaultDocModal({
  doc,
  onClose,
  onSuccess,
}: {
  doc: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data: requests, isLoading: loadingRequests } = useQuery({
    queryKey: ["my-requests"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load requests");
      const list = await res.json();
      return list.map((r: any) => ({
        id: r.id,
        serviceTitle: r.serviceTitle,
        referenceNo: r.referenceNo,
        authority: r.authority,
        form: r.form,
        requiredDocuments: r.requiredDocuments || [],
      }));
    },
  });

  // Auto-select first request if available
  useEffect(() => {
    if (requests && requests.length > 0 && selectedRequestId === null) {
      setSelectedRequestId(requests[0].id);
    }
  }, [requests, selectedRequestId]);

  const activeRequest = requests?.find((r: any) => r.id === selectedRequestId);
  const requiredDocs = activeRequest ? getRequiredDocumentsForRequest(activeRequest) : [];

  // Auto-select first checklist slot when active request changes
  useEffect(() => {
    if (requiredDocs.length > 0) {
      setSelectedLabel(requiredDocs[0]);
    } else {
      setSelectedLabel("Additional Document");
    }
  }, [selectedRequestId, requests]);

  const handleAssign = async () => {
    if (!selectedRequestId) return;
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/${selectedRequestId}/link-vault-docs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            docIds: [doc.id],
            label: selectedLabel,
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to attach document to registration");
      }

      setSuccessMsg(`Document attached successfully as "${selectedLabel}"!`);
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || "Failed to attach document");
    } finally {
      setSubmitting(false);
    }
  };

  const parsedDoc = parseDocLabel(doc.name);

  const content = (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in-0 duration-200">
      <div className="fixed inset-0 bg-slate-950/90" onClick={onClose} />

      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl flex flex-col z-10 animate-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-navy/95 to-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-white/10 shrink-0">
          <div>
            <h3 className="text-base font-display font-bold text-white flex items-center gap-2">
              <FolderLock className="size-4 text-primary" /> Attach Vault Document
            </h3>
            <p className="text-[11px] text-white/70">
              Select which registration application and document slot to assign this file.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Scroll Body */}
        <div className="p-6 space-y-4">
          {/* Selected File Banner */}
          <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/[0.04] flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
              <FileText className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-foreground truncate">{parsedDoc.fileName || doc.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                Vault File · Category: {parsedDoc.label}
              </div>
            </div>
          </div>

          {error && (
            <div className="text-xs text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="text-xs text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="size-3.5 text-emerald-500" /> {successMsg}
            </div>
          )}

          {loadingRequests ? (
            <div className="py-8 grid place-items-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : requests && requests.length > 0 ? (
            <div className="space-y-4">
              {/* Step 1: Select Application */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  1. Select Target Registration Application
                </label>
                <select
                  value={selectedRequestId ?? ""}
                  onChange={(e) => setSelectedRequestId(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {requests.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.serviceTitle} ({r.referenceNo})
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Select Document Checklist Slot */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  2. Select Target Document Checklist Slot
                </label>
                <select
                  value={selectedLabel}
                  onChange={(e) => setSelectedLabel(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {requiredDocs.map((slotName: string, idx: number) => (
                    <option key={idx} value={slotName}>
                      {slotName}
                    </option>
                  ))}
                  <option value="Additional Document">Other / Additional Attachment</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
              No active registration applications found. Submit a service registration application first to attach documents.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          {requests && requests.length > 0 && (
            <button
              type="button"
              onClick={handleAssign}
              disabled={submitting || !selectedRequestId}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand hover:opacity-95 disabled:opacity-60 transition-all cursor-pointer"
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Attach Document
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
