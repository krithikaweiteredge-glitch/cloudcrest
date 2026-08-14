import { createFileRoute, Link } from "@tanstack/react-router";
import { assetUrl } from "@/lib/file-url";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { FileText, Download, UploadCloud, X, Loader2, Info, User, Mail, Phone, Building2, Coins, Calendar, CheckCircle2, ChevronRight, Clock } from "lucide-react";
import { StatusPill, EmptyState } from "./profile.index";
import { BrandLoader } from "@/components/brand-loader";
import { splitRequestNotes } from "@/lib/request-notes";
import { renderExtraFormFields } from "@/lib/request-fields";

export const Route = createFileRoute("/_authenticated/profile/requests")({
  validateSearch: (s: Record<string, unknown>): { ref?: string } => ({
    ref: typeof s.ref === "string" ? s.ref : undefined,
  }),
  component: RequestsPage,
});

function parseDocLabel(name: string): { label: string; fileName: string } {
  if (!name) return { label: "Uploaded Document", fileName: "document" };

  // 1. Remove all non-ASCII / corrupted symbols (like 'â   ', 'â', etc.) from the whole string
  const sanitized = name
    .replace(/â[^\s]*/g, " - ")
    .replace(/[^\x20-\x7E]/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

  // 2. Separate into rawLabel and rawFileName by separator: ' __FILE__ ', ' :: ', ' : ', ' - '
  let rawLabel = "";
  let rawFileName = sanitized;

  const separators = [" __FILE__ ", " :: ", " : ", " - "];
  for (const sep of separators) {
    if (sanitized.includes(sep)) {
      const idx = sanitized.indexOf(sep);
      rawLabel = sanitized.substring(0, idx).trim();
      rawFileName = sanitized.substring(idx + sep.length).trim();
      break;
    }
  }

  if (!rawLabel) {
    rawLabel = "Uploaded Document";
  }

  // 3. Map rawLabel to customer-facing document title
  let label = rawLabel;
  const lowerLabel = rawLabel.toLowerCase();

  if (lowerLabel.includes("karta")) {
    label = "PAN of Karta";
  } else if (lowerLabel === "moa" || lowerLabel.includes("trust deed") || lowerLabel.includes("moa")) {
    label = "Trust Deed / MoA";
  } else if (lowerLabel === "aoa" || lowerLabel.includes("aoa")) {
    label = "AoA";
  } else if (lowerLabel.includes("member")) {
    label = "Members List";
  } else if (lowerLabel.includes("pan")) {
    label = "PAN Card";
  } else if (lowerLabel.includes("aadhaar") || lowerLabel.includes("adhar")) {
    label = "Aadhaar Card";
  } else if (lowerLabel.includes("passport")) {
    label = "Passport";
  } else if (lowerLabel.includes("voter")) {
    label = "Voter ID";
  } else if (lowerLabel.includes("bank") || lowerLabel.includes("statement")) {
    label = "Bank Statement";
  } else if (lowerLabel.includes("utility") || lowerLabel.includes("bill") || lowerLabel.includes("electricity")) {
    label = "Utility Bill / Address Proof";
  } else if (lowerLabel.includes("photo")) {
    label = "Passport Photo";
  } else if (lowerLabel.includes("deed")) {
    label = "Trust Deed / Agreement";
  } else if (lowerLabel.includes("certificate") || lowerLabel.includes("cert")) {
    label = "Certificate";
  } else if (label.length > 0) {
    label = label.charAt(0).toUpperCase() + label.slice(1);
  }

  let fileName = rawFileName.replace(/^[-\s]+|[-\s]+$/g, "").trim();
  if (!fileName) fileName = "Uploaded File";

  return { label, fileName };
}

function formatDateTime(dateStr: string | Date) {
  if (!dateStr) return "—";
  let d: Date;
  if (dateStr instanceof Date) {
    d = dateStr;
  } else {
    const s = String(dateStr).trim();
    const isoCandidate = s.includes(" ") && !s.includes("T") ? s.replace(" ", "T") : s;
    d = new Date(isoCandidate);
  }
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function RequestsPage() {
  const queryClient = useQueryClient();
  const { ref } = Route.useSearch();
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const openedRef = useRef<string | null>(null);

  const { data, isLoading } = useQuery({
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
        businessName: r.businessName,
        authority: r.authority,
        form: r.form,
        contactName: r.contactName,
        contactEmail: r.contactEmail,
        contactPhone: r.contactPhone,
        authorisedCapital: r.authorisedCapital,
        paidCapital: r.paidCapital,
        notes: r.notes,
        formData: r.formData,
        createdAt: r.createdAt,
        status: r.status || "pending",
        documents: r.documents || [],
      }));
    },
  });

  // When arriving from a notification (?ref=CC-XXXX), auto-open that registration
  // once. Tracked in a ref so it doesn't reopen after the user closes the modal.
  useEffect(() => {
    if (ref && data && openedRef.current !== ref) {
      const match = data.find((r: any) => r.referenceNo === ref);
      if (match) {
        setSelectedRequest(match);
        openedRef.current = ref;
      }
    }
  }, [ref, data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-semibold">My Registrations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            View live status, admin remarks, and manage uploaded files for your submissions.
          </p>
        </div>
        <Link to="/" className="text-xs px-3.5 py-2 rounded-lg gradient-brand text-white shadow-brand font-semibold">
          New registration
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-card overflow-x-auto">
        {isLoading ? (
          <BrandLoader />
        ) : data && data.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[10px] mono uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 whitespace-nowrap">Service</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Reference</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Submitted</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r: any) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedRequest(r)}
                  className="hover:bg-muted/40 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <FileText className="size-3.5 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                      <span className="font-semibold group-hover:text-primary transition-colors">{r.serviceTitle}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {r.authority} {r.form ? `· ${r.form}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 mono text-[12px] font-bold text-foreground/90 whitespace-nowrap">{r.referenceNo}</td>
                  <td className="px-4 py-3.5 text-[12px] text-muted-foreground whitespace-nowrap">
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSelectedRequest(r); }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                    >
                      View Details <ChevronRight className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            icon={FileText}
            title="No registrations yet"
            body="Once you submit a service application, it will show up here with live status."
            cta={{ label: "Browse services", to: "/" }}
          />
        )}
      </div>

      {selectedRequest && (
        <RegistrationDetailDialog
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onRefresh={async () => {
            await queryClient.invalidateQueries({ queryKey: ["my-requests"] });
            fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/${selectedRequest.id}`, {
              credentials: "include",
            })
              .then((res) => (res.ok ? res.json() : null))
              .then((updated) => {
                if (updated) setSelectedRequest(updated);
              });
          }}
        />
      )}
    </div>
  );
}

function RegistrationDetailDialog({
  request,
  onClose,
  onRefresh,
}: {
  request: any;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const openDoc = (path: string) => {
    window.open(assetUrl(path), "_blank", "noopener");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      for (const f of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", f);

        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/${request.id}/documents`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Failed to upload ${f.name}`);
        }
      }

      setUploadSuccess("Document(s) uploaded successfully!");
      onRefresh();
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  let fd: any = {};
  if (request.formData) {
    try {
      fd = typeof request.formData === "string" ? JSON.parse(request.formData) : request.formData;
    } catch (_) {}
  }

  const authorisedCapital = request.authorisedCapital ?? fd.capital ?? fd.totalCapital;
  const paidCapital = request.paidCapital ?? fd.paidCapital;
  const capitalVal = paidCapital ?? authorisedCapital;
  const inr = (v: any) => `₹${Number(v).toLocaleString("en-IN")}`;

  const isCompanyReg =
    (request.serviceTitle && request.serviceTitle.toLowerCase().includes("company")) ||
    (request.form && request.form.toLowerCase().includes("spice")) ||
    Boolean(request.businessName || capitalVal || fd.name1 || fd.address);

  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in-0 duration-200">
      {/* 100% Viewport Dark Backdrop Blur */}
      <div className="fixed inset-0 bg-slate-950/90" onClick={onClose} />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl flex flex-col z-10 animate-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-navy/95 to-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="space-y-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono text-[10px] font-bold uppercase tracking-wider bg-white/15 text-white px-2.5 py-0.5 rounded-md border border-white/20">
                {request.referenceNo}
              </span>
              <span className="text-white/80 text-xs font-medium">
                {request.authority}{request.form ? ` · ${request.form}` : ""}
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-display font-bold leading-snug text-white truncate">
              {request.serviceTitle}
            </h3>
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Bar */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground">Current Application Status</span>
            </div>
            <StatusPill status={request.status || "pending"} />
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Contact Info Card */}
            <div className="p-4 rounded-xl border border-border/70 bg-card space-y-3 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 border-b border-border/60 pb-2">
                <User className="size-3.5" /> Contact Information
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <User className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Full Name</span>
                    <span className="font-semibold text-foreground">{request.contactName || "—"}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Mail className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Email Address</span>
                    <span className="font-medium text-foreground">{request.contactEmail || "—"}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Mobile Number</span>
                    <span className="font-medium text-foreground">{request.contactPhone || "—"}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Submission Timestamp</span>
                    <span className="font-medium text-foreground">{formatDateTime(request.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Entity & Filing Details Card */}
            {isCompanyReg && (
              <div className="p-4 rounded-xl border border-border/70 bg-card space-y-3 shadow-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 border-b border-border/60 pb-2">
                  <Building2 className="size-3.5" /> Entity & Filing Details
                </div>
                <div className="space-y-2 text-xs">
                  {fd.gstType && <DetailLine icon={FileText} label="GST Registration Type" value={fd.gstType} />}
                  {fd.partnershipType && <DetailLine icon={FileText} label="Partnership Type" value={fd.partnershipType} />}
                  <DetailLine icon={Building2} label="Proposed Name 1" value={fd.name1 || request.businessName || "—"} />
                  {fd.name2 && <DetailLine icon={Building2} label="Proposed Name 2" value={fd.name2} />}
                  {fd.suffix && <DetailLine icon={Building2} label="Entity Suffix" value={fd.suffix} />}
                  {fd.llpType && <DetailLine icon={Building2} label="LLP Type" value={fd.llpType} />}
                  {fd.foreignCountry && <DetailLine icon={Building2} label="Country of Incorporation" value={fd.foreignCountry} />}
                  {fd.entityClass && <DetailLine icon={Building2} label="Company Class" value={fd.entityClass} />}
                  {fd.liability && <DetailLine icon={Building2} label="Liability" value={fd.liability} />}
                  {fd.industryType && <DetailLine icon={Building2} label="Industry Type" value={fd.industryType} />}
                  {request.form && <DetailLine icon={FileText} label="Filing Form" value={request.form} />}
                  {/* Guarantee companies have no share capital — show members instead. */}
                  {authorisedCapital != null && <DetailLine icon={Coins} label="Authorised Capital" value={inr(authorisedCapital)} />}
                  {paidCapital != null && <DetailLine icon={Coins} label="Paid-up Capital" value={inr(paidCapital)} />}
                  {fd.directors != null && <DetailLine icon={User} label="Directors" value={String(fd.directors)} />}
                  {fd.shareholders != null && <DetailLine icon={User} label="Shareholders" value={String(fd.shareholders)} />}
                  {fd.members != null && <DetailLine icon={User} label="Members" value={String(fd.members)} />}
                  {fd.partners != null && <DetailLine icon={User} label="Partners" value={String(fd.partners)} />}
                  {fd.nominee && <DetailLine icon={User} label="Nominee" value={fd.nominee} />}
                </div>
              </div>
            )}
          </div>

          {/* Registered Office Address Card */}
          {(fd.address || fd.city || fd.state) && (
            <div className="p-4 rounded-xl border border-border/70 bg-card space-y-2 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 border-b border-border/60 pb-2">
                <Building2 className="size-3.5" /> Registered Office Address
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                <div>
                  <span className="text-[11px] text-muted-foreground block">Address Line</span>
                  <span className="font-medium text-foreground">{fd.address || "—"}</span>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block">City, State & PIN Code</span>
                  <span className="font-medium text-foreground">
                    {[fd.city, fd.state].filter(Boolean).join(", ")} {fd.pincode ? `- ${fd.pincode}` : ""}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Object / nature of business */}
          {fd.objects && (
            <div className="p-4 rounded-xl border border-border/70 bg-card space-y-1.5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 border-b border-border/60 pb-2">
                <Building2 className="size-3.5" /> Object / Nature of Business
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/85 pt-1">{fd.objects}</p>
            </div>
          )}

          {/* Any remaining details captured on the form that aren't shown in a
              dedicated card above — so everything the applicant filled in is
              visible here. */}
          {renderExtraFormFields(fd)}

          {/* The notes column mixes the applicant's own note with admin remarks —
              split them so each is shown under the right heading. */}
          {(() => {
            const { applicantNote, adminRemarks } = splitRequestNotes(request.notes);
            return (
              <>
                {applicantNote && (
                  <div className="p-4 rounded-xl border border-sky-500/30 bg-sky-50 dark:bg-sky-950/30 text-sky-950 dark:text-sky-100 space-y-1.5 shadow-sm">
                    <div className="text-xs font-bold flex items-center gap-2 text-sky-700 dark:text-sky-300">
                      <Info className="size-4 shrink-0" /> Your Note
                    </div>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap pl-6">
                      {applicantNote}
                    </p>
                  </div>
                )}
                {adminRemarks.length > 0 && (
                  <div className="p-4 rounded-xl border border-primary/30 bg-primary/[0.04] space-y-2.5 shadow-sm">
                    <div className="text-xs font-bold flex items-center gap-2 text-primary">
                      <Info className="size-4 shrink-0" /> Updates from Cloudcrest
                    </div>
                    <ul className="space-y-2 pl-6">
                      {adminRemarks.map((rem, i) => (
                        <li key={i} className="text-xs leading-relaxed">
                          <span className="mono text-[10px] text-muted-foreground">{rem.stamp}</span>
                          <p className="whitespace-pre-wrap text-foreground/90 mt-0.5">{rem.message}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            );
          })()}

          {/* Documents Section */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Uploaded Documents ({request.documents?.length || 0})
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Files attached to this registration. You can upload additional requested files below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand hover:opacity-95 disabled:opacity-60 transition-all shrink-0"
              >
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
                Upload File
              </button>
              <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileUpload} />
            </div>

            {uploadError && (
              <div className="text-xs text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2">
                {uploadError}
              </div>
            )}

            {uploadSuccess && (
              <div className="text-xs text-success rounded-lg border border-success/30 bg-success/10 px-3.5 py-2 flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="size-3.5" /> {uploadSuccess}
              </div>
            )}

            {request.documents && request.documents.length > 0 ? (
              <ul className="grid grid-cols-1 gap-2.5">
                {request.documents.map((doc: any) => {
                  const parsed = parseDocLabel(doc.name);
                  return (
                    <li key={doc.id} className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm space-y-2.5 hover:border-primary/40 transition-colors">
                      {/* Document Category / Name Header */}
                      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wider min-w-0 truncate">
                          <FileText className="size-3 shrink-0" />
                          {parsed.label}
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          Submitted by user
                        </span>
                      </div>

                      {/* File Details Below Document Name */}
                      <div className="flex items-center justify-between gap-3 pt-0.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="size-8 rounded-lg bg-muted grid place-items-center shrink-0">
                            <FileText className="size-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <div className="font-semibold text-xs text-foreground truncate">{parsed.fileName}</div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                              {doc.sizeBytes ? <span>{(doc.sizeBytes / 1024).toFixed(0)} KB</span> : null}
                              {doc.sizeBytes ? <span>·</span> : null}
                              <span>Uploaded {formatDateTime(doc.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openDoc(doc.storagePath)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted hover:bg-primary/10 hover:text-primary transition-colors text-foreground shrink-0"
                        >
                          <Download className="size-3" /> View
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                No files attached yet for this registration. Click "Upload File" above to add documents.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

function DetailLine({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-[11px] text-muted-foreground block">{label}</span>
        <span className="font-medium text-foreground break-words">{value}</span>
      </div>
    </div>
  );
}
