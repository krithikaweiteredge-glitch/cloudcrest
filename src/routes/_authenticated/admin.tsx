import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import AppShell from "@/components/app-shell";
import { StatusPill } from "./profile.index";
import { AdminCatalogPanel } from "@/components/admin-catalog";
import { getModule, DEPARTMENT_SLUGS } from "@/lib/modules";
import { useCatalogFamily, useCatalogService } from "@/lib/service-catalog";
import { assetUrl } from "@/lib/file-url";
import { splitRequestNotes } from "@/lib/request-notes";
import { renderExtraFormFields } from "@/lib/request-fields";
import { useAuth } from "@/hooks/use-auth";
import {
  Bell, Send, X, Loader2, ShieldAlert, FileText, User, CheckCircle2, ListFilter,
  Download, Eye, Mail, Phone, Building2, Coins, Calendar, Info, Clock, ChevronRight, LifeBuoy,
  Users, UserPlus, Lock, Unlock,
} from "lucide-react";

type AdminView = "registrations" | "tickets" | "notifications" | "catalog" | "employees";
type Search = { service?: string; view?: AdminView };

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin Console — Cloudcrest BM" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    service: typeof s.service === "string" ? s.service : undefined,
    view:
      s.view === "tickets" || s.view === "notifications" || s.view === "catalog" || s.view === "employees"
        ? s.view
        : undefined,
  }),
  component: AdminPage,
});

const BACKEND = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

type AdminRequest = {
  id: number;
  referenceNo: string;
  serviceSlug: string | null;
  serviceTitle: string;
  authority: string | null;
  form: string | null;
  status: string;
  createdAt: string;
  userId: number | null;
  contactName: string | null;
  contactEmail: string | null;
  userName: string | null;
  userEmail: string | null;
};

function AdminPage() {
  const { service, view: viewParam } = Route.useSearch();
  const { isAdmin } = useAuth();
  // Catalog + employee management are Admin-only. If a coordinator lands on one of
  // those views (old link, manual URL), fall back to registrations instead.
  const requestedView: AdminView = viewParam ?? "registrations";
  const view: AdminView =
    !isAdmin && (requestedView === "catalog" || requestedView === "employees")
      ? "registrations"
      : requestedView;
  const navigate = Route.useNavigate();
  const [target, setTarget] = useState<AdminRequest | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [ticketId, setTicketId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-requests"],
    queryFn: async () => {
      const res = await fetch(`${BACKEND}/api/admin/requests`, { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        const err: any = new Error("forbidden");
        err.code = res.status;
        throw err;
      }
      if (!res.ok) throw new Error("Failed to load registrations");
      return (await res.json()) as AdminRequest[];
    },
    retry: false,
  });

  if (error && (error as any).code) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-16 text-center animate-in-up">
          <div className="size-14 rounded-full bg-destructive/10 text-destructive grid place-items-center mx-auto mb-4">
            <ShieldAlert className="size-7" />
          </div>
          <h1 className="text-xl font-display font-semibold">Admin access required</h1>
          <p className="text-sm text-muted-foreground mt-2">
            This console is restricted to Cloudcrest BM administrators. Your account does not have
            admin privileges.
          </p>
        </div>
      </AppShell>
    );
  }

  const mod = service ? getModule(service) : undefined;
  // The header name for a selected service: built-in modules resolve instantly;
  // DB-only ones (departments, admin-published) come from the catalog.
  const { service: selectedSvc } = useCatalogService(service ? [service] : []);
  const selectedName = mod?.title ?? selectedSvc?.title ?? null;
  // A launcher (GST/Company/Partnership, or an industry department) has no
  // registrations of its own — customers apply for its sub-heads, whose requests
  // are filed under the sub-head slug. So when a launcher is selected, match its
  // sub-heads too, otherwise the list looks empty. `useCatalogFamily` returns the
  // sibling services; for a department every sibling is a sub-head, for the others
  // we keep only the `slug-` variants (the subcategory holds unrelated services).
  const { variants } = useCatalogFamily(service ?? "");
  const matchSlugs = ((): Set<string> | null => {
    if (!service) return null;
    const base = service; // narrowed to string
    const isDept = DEPARTMENT_SLUGS.has(base);
    const kids = (variants ?? [])
      .filter((v) => v.slug && (isDept || v.slug.startsWith(base + "-")))
      .map((v) => v.slug);
    return new Set<string>([base, ...kids]);
  })();
  const filtered = matchSlugs
    ? (data ?? []).filter((r) => matchSlugs.has(r.serviceSlug ?? ""))
    : data ?? [];

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 animate-in-up">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-11 rounded-xl gradient-brand text-white grid place-items-center shadow-brand">
            <ShieldAlert className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="label-eyebrow text-primary">{isAdmin ? "Admin Console" : "Employee Console"}</div>
            <h1 className="text-2xl font-display font-semibold">
              {view === "tickets"
                ? "All Support Tickets"
                : view === "notifications"
                ? "Notifications"
                : view === "catalog"
                ? "Services Catalog"
                : view === "employees"
                ? "Employees"
                : selectedName
                ? `${selectedName} Registrations`
                : "All Registrations"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {view === "tickets"
                ? "Read and resolve support tickets raised by users."
                : view === "notifications"
                ? "Broadcast an announcement to every user."
                : view === "catalog"
                ? "Create and manage services, fees, page tabs and document checklists."
                : view === "employees"
                ? "Add coordinator accounts and manage staff access to the console."
                : selectedName
                ? `Showing registrations submitted for ${selectedName} (including its sub-heads). Pick another service from the sidebar to switch.`
                : "Pick a service from the sidebar to filter, or review every submitted registration below."}
            </p>
          </div>
        </div>

        {/* View tabs — Services + Employees are Admin-only. */}
        <div className="mb-5 flex gap-1 p-1 rounded-lg bg-muted w-fit">
          {(
            [
              ["registrations", "All Registrations"],
              ["tickets", "All Support Tickets"],
              ["notifications", "Notification"],
              ...(isAdmin
                ? ([
                    ["catalog", "Services"],
                    ["employees", "Employees"],
                  ] as const)
                : []),
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => navigate({ search: v === "registrations" ? {} : { view: v } })}
              className={
                "px-4 h-8 rounded-md text-xs font-semibold transition-all " +
                (view === v ? "bg-surface shadow-card text-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {view === "tickets" ? (
          <AdminTicketsPanel onOpen={setTicketId} />
        ) : view === "notifications" ? (
          <AdminNotificationsPanel />
        ) : view === "catalog" ? (
          <AdminCatalogPanel />
        ) : view === "employees" ? (
          <EmployeesPanel />
        ) : (
        <>
        {service && (
          <div className="mb-4 flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
              <ListFilter className="size-3" /> Filtered: {selectedName ?? service}
            </span>
            <Link to="/admin" className="text-muted-foreground hover:text-foreground underline underline-offset-2">
              Show all registrations
            </Link>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface shadow-card overflow-x-auto">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[10px] mono uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Service</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Reference</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Applicant</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setDetailId(r.id)}
                    className="hover:bg-muted/40 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <FileText className="size-3.5 text-primary shrink-0" />
                        <span className="font-semibold group-hover:text-primary transition-colors">{r.serviceTitle}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {r.authority} {r.form ? `· ${r.form}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 mono text-[12px] font-bold text-foreground/90 whitespace-nowrap">
                      {r.referenceNo}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-foreground">{r.contactName || r.userName || "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{r.contactEmail || r.userEmail || "—"}</div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <RegistrationStatusSelect id={r.id} currentStatus={r.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted hover:bg-primary/10 hover:text-primary transition-all text-foreground"
                        >
                          View <ChevronRight className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setTarget(r); }}
                          disabled={!r.userId}
                          title={r.userId ? "Notify applicant" : "No linked user account"}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all shadow-sm disabled:opacity-40 disabled:hover:bg-primary/10 disabled:hover:text-primary"
                        >
                          <Bell className="size-3.5" /> Notify
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {selectedName
                ? `No registrations have been submitted for ${selectedName} yet.`
                : "No registrations have been submitted yet."}
            </div>
          )}
        </div>
        </>
        )}
      </div>

      {detailId != null && (
        <AdminDetailDialog
          id={detailId}
          onClose={() => setDetailId(null)}
          onNotify={(r) => { setDetailId(null); setTarget(r); }}
        />
      )}
      {target && <NotifyDialog request={target} onClose={() => setTarget(null)} />}
      {ticketId != null && <AdminTicketDialog id={ticketId} onClose={() => setTicketId(null)} />}
    </AppShell>
  );
}

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

function formatDateTime(dateStr?: string | null) {
  if (!dateStr) return "—";
  const s = String(dateStr).trim();
  const iso = s.includes(" ") && !s.includes("T") ? s.replace(" ", "T") : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function viewDoc(storagePath: string) {
  window.open(assetUrl(storagePath), "_blank", "noopener");
}

async function downloadDoc(doc: any) {
  const url = assetUrl(doc.storagePath);
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = doc.name || "document";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Fallback: open in a new tab if the direct download fails
    window.open(url, "_blank", "noopener");
  }
}

function RegistrationStatusSelect({
  id,
  currentStatus,
  onUpdated,
}: {
  id: number;
  currentStatus: string;
  onUpdated?: (newStatus: string) => void;
}) {
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);

  const handleChange = async (newStatus: string) => {
    if (newStatus === currentStatus || updating) return;
    setUpdating(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/requests/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update status");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-request", id] }),
      ]);
      if (onUpdated) onUpdated(newStatus);
    } catch (err: any) {
      alert(err.message || "Failed to update registration status");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <select
        value={currentStatus || "pending"}
        disabled={updating}
        onChange={(e) => handleChange(e.target.value)}
        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border bg-surface text-foreground shadow-sm ring-focus cursor-pointer disabled:opacity-50 hover:border-primary/50 transition-colors"
      >
        <option value="pending">Pending</option>
        <option value="processing">Processing</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="submitted">Submitted</option>
        <option value="in-review">In Review</option>
        <option value="filed">Filed</option>
      </select>
      {updating && <Loader2 className="size-3.5 text-primary animate-spin" />}
    </div>
  );
}

function AdminDetailDialog({
  id,
  onClose,
  onNotify,
}: {
  id: number;
  onClose: () => void;
  onNotify: (r: AdminRequest) => void;
}) {
  const { data: r, isLoading } = useQuery({
    queryKey: ["admin-request", id],
    queryFn: async () => {
      const res = await fetch(`${BACKEND}/api/admin/requests/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load registration");
      return await res.json();
    },
  });

  let fd: any = {};
  if (r?.formData) {
    try {
      fd = typeof r.formData === "string" ? JSON.parse(r.formData) : r.formData;
    } catch {
      fd = {};
    }
  }

  const authorisedCapital = r?.authorisedCapital ?? fd.capital ?? fd.totalCapital;
  const paidCapital = r?.paidCapital ?? fd.paidCapital;
  const inr = (v: any) => `₹${Number(v).toLocaleString("en-IN")}`;
  const docs: any[] = r?.documents || [];

  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in-0 duration-200">
      <div className="fixed inset-0 bg-slate-950/90" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl flex flex-col z-10 animate-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-navy/95 to-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="space-y-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono text-[10px] font-bold uppercase tracking-wider bg-white/15 text-white px-2.5 py-0.5 rounded-md border border-white/20">
                {r?.referenceNo || `#${id}`}
              </span>
              {r && (
                <span className="text-white/80 text-xs font-medium">
                  {r.authority}{r.form ? ` · ${r.form}` : ""}
                </span>
              )}
            </div>
            <h3 className="text-lg sm:text-xl font-display font-bold leading-snug text-white truncate">
              {r?.serviceTitle || "Registration details"}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading || !r ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading details…</div>
          ) : (
            <>
              {/* Status */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Application Status</span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill status={r.status || "pending"} />
                  <RegistrationStatusSelect id={r.id} currentStatus={r.status} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Applicant */}
                <div className="p-4 rounded-xl border border-border/70 bg-card space-y-3 shadow-sm">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 border-b border-border/60 pb-2">
                    <User className="size-3.5" /> Applicant
                  </div>
                  <div className="space-y-2 text-xs">
                    <DetailRow icon={User} label="Full Name" value={r.contactName || (r.applicant ? `${r.applicant.firstName ?? ""} ${r.applicant.lastName ?? ""}`.trim() : "—")} />
                    <DetailRow icon={Mail} label="Email" value={r.contactEmail || r.applicant?.email || "—"} />
                    <DetailRow icon={Phone} label="Mobile" value={r.contactPhone || r.applicant?.phone || "—"} />
                    <DetailRow icon={Calendar} label="Submitted" value={formatDateTime(r.createdAt)} />
                  </div>
                </div>

                {/* Entity / filing */}
                <div className="p-4 rounded-xl border border-border/70 bg-card space-y-3 shadow-sm">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 border-b border-border/60 pb-2">
                    <Building2 className="size-3.5" /> Entity & Filing
                  </div>
                  <div className="space-y-2 text-xs">
                    {fd.gstType && <DetailRow icon={FileText} label="GST Registration Type" value={fd.gstType} />}
                    {fd.partnershipType && <DetailRow icon={FileText} label="Partnership Type" value={fd.partnershipType} />}
                    {fd.trustType && <DetailRow icon={FileText} label="Trust Type" value={fd.trustType} />}
                    <DetailRow icon={Building2} label="Proposed Name" value={fd.name1 || r.businessName || "—"} />
                    {fd.name2 && <DetailRow icon={Building2} label="Alternate Name" value={fd.name2} />}
                    {fd.suffix && <DetailRow icon={Building2} label="Entity Suffix" value={fd.suffix} />}
                    {fd.llpType && <DetailRow icon={Building2} label="LLP Type" value={fd.llpType} />}
                    {fd.foreignCountry && <DetailRow icon={Building2} label="Country of Incorporation" value={fd.foreignCountry} />}
                    {fd.entityClass && <DetailRow icon={Building2} label="Company Class" value={fd.entityClass} />}
                    {fd.liability && <DetailRow icon={Building2} label="Liability" value={fd.liability} />}
                    {fd.industryType && <DetailRow icon={Building2} label="Industry Type" value={fd.industryType} />}
                    {r.form && <DetailRow icon={FileText} label="Filing Form" value={r.form} />}
                    {/* Guarantee companies have no share capital — show members instead. */}
                    {authorisedCapital != null && <DetailRow icon={Coins} label="Authorised Capital" value={inr(authorisedCapital)} />}
                    {paidCapital != null && <DetailRow icon={Coins} label="Paid-up Capital" value={inr(paidCapital)} />}
                    {fd.directors != null && <DetailRow icon={User} label="Directors" value={String(fd.directors)} />}
                    {fd.shareholders != null && <DetailRow icon={User} label="Shareholders" value={String(fd.shareholders)} />}
                    {fd.members != null && <DetailRow icon={User} label="Members" value={String(fd.members)} />}
                    {fd.partners != null && <DetailRow icon={User} label="Partners" value={String(fd.partners)} />}
                    {fd.nominee && <DetailRow icon={User} label="Nominee" value={fd.nominee} />}
                  </div>
                </div>
              </div>

              {/* Office address */}
              {(fd.address || fd.city || fd.state) && (
                <div className="p-4 rounded-xl border border-border/70 bg-card space-y-2 shadow-sm">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 border-b border-border/60 pb-2">
                    <Building2 className="size-3.5" /> Registered Office
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                    <div>
                      <span className="text-[11px] text-muted-foreground block">Address</span>
                      <span className="font-medium text-foreground">{fd.address || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground block">City, State & PIN</span>
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

              {/* Any remaining captured fields not shown in a dedicated card, so
                  the admin sees everything the applicant filled in. */}
              {renderExtraFormFields(fd)}

              {/* Notes — the applicant's own note and admin remarks are stored in
                  the same column; split them so each is labelled correctly. */}
              {(() => {
                const { applicantNote, adminRemarks } = splitRequestNotes(r.notes);
                return (
                  <>
                    {applicantNote && (
                      <div className="p-4 rounded-xl border border-sky-500/30 bg-sky-50 dark:bg-sky-950/30 text-sky-950 dark:text-sky-100 space-y-1.5 shadow-sm">
                        <div className="text-xs font-bold flex items-center gap-2 text-sky-700 dark:text-sky-300">
                          <Info className="size-4 shrink-0" /> Note from Applicant
                        </div>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap pl-6">{applicantNote}</p>
                      </div>
                    )}
                    {adminRemarks.length > 0 && (
                      <div className="p-4 rounded-xl border border-primary/30 bg-primary/[0.04] space-y-2.5 shadow-sm">
                        <div className="text-xs font-bold flex items-center gap-2 text-primary">
                          <ShieldAlert className="size-4 shrink-0" /> Admin Remarks (sent to applicant)
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

              {/* Documents */}
              <div className="space-y-3 pt-2 border-t border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Uploaded Documents ({docs.length})
                </h4>
                {docs.length > 0 ? (
                  <ul className="grid grid-cols-1 gap-2.5">
                    {docs.map((doc) => {
                      const parsed = parseDocLabel(doc.name);
                      return (
                        <li key={doc.id} className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm space-y-2.5">
                          {/* Required Document Name Header */}
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

                          {/* Uploaded File Details Below Document Name */}
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
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => viewDoc(doc.storagePath)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-muted hover:bg-primary/10 hover:text-primary transition-colors text-foreground"
                              >
                                <Eye className="size-3" /> View
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadDoc(doc)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                              >
                                <Download className="size-3" /> Download
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                    No files were uploaded for this registration.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 flex justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors"
          >
            Close
          </button>
          {r && (
            <button
              type="button"
              onClick={() =>
                onNotify({
                  id: r.id,
                  referenceNo: r.referenceNo,
                  serviceSlug: r.serviceSlug ?? null,
                  serviceTitle: r.serviceTitle,
                  authority: r.authority ?? null,
                  form: r.form ?? null,
                  status: r.status,
                  createdAt: r.createdAt,
                  userId: r.userId ?? null,
                  contactName: r.contactName ?? null,
                  contactEmail: r.contactEmail ?? null,
                  userName: r.applicant?.firstName ?? null,
                  userEmail: r.applicant?.email ?? null,
                })
              }
              disabled={!r.userId}
              className="flex items-center gap-2 px-5 py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand hover:shadow-elev transition-all disabled:opacity-50"
            >
              <Bell className="size-3.5" /> Notify Applicant
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

function AdminTicketsPanel({ onOpen }: { onOpen: (id: number) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: async () => {
      const res = await fetch(`${BACKEND}/api/admin/tickets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tickets");
      return (await res.json()) as any[];
    },
  });

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card overflow-x-auto">
      {isLoading ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : data && data.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[10px] mono uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 whitespace-nowrap">Subject</th>
              <th className="text-left px-4 py-3 whitespace-nowrap">Customer</th>
              <th className="text-left px-4 py-3 whitespace-nowrap">Status</th>
              <th className="text-right px-4 py-3 whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((t) => (
              <tr key={t.id} onClick={() => onOpen(t.id)} className="hover:bg-muted/40 cursor-pointer transition-colors group">
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <LifeBuoy className="size-3.5 text-primary shrink-0" />
                    <span className="font-semibold group-hover:text-primary transition-colors">{t.subject}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mono mt-0.5">Ticket #{t.id}</div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="font-medium text-foreground">{t.customerName || "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{t.customerEmail || "—"}</div>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <StatusPill status={t.status} />
                </td>
                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpen(t.id); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                  >
                    Open <ChevronRight className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="p-10 text-center text-sm text-muted-foreground">No support tickets have been raised yet.</div>
      )}
    </div>
  );
}

function AdminTicketDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-ticket", id],
    queryFn: async () => {
      const res = await fetch(`${BACKEND}/api/admin/tickets/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load ticket");
      return await res.json();
    },
  });

  const ticket = data?.ticket;
  const messages: any[] = data?.messages || [];

  const resolve = async () => {
    setErr(null);
    if (!reply.trim()) {
      setErr("Enter a resolution message for the customer.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/tickets/${id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to send reply");
      setReply("");
      await queryClient.invalidateQueries({ queryKey: ["admin-ticket", id] });
      await queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
    } catch (e: any) {
      setErr(e.message || "Failed to send reply");
    } finally {
      setBusy(false);
    }
  };

  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in-0 duration-200">
      <div className="fixed inset-0 bg-slate-950/90" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl flex flex-col z-10 animate-in zoom-in-95 duration-200 my-auto">
        <div className="bg-gradient-to-r from-slate-900 via-navy/95 to-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2 text-white/80 text-xs">
              <User className="size-3.5" />
              <span className="truncate">{ticket?.customerName || ticket?.customerEmail || "Customer"}</span>
            </div>
            <h3 className="text-lg font-display font-bold leading-snug mt-0.5 truncate">
              {ticket?.subject || "Support ticket"}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {ticket && <StatusPill status={ticket.status} />}
            <button
              type="button"
              onClick={onClose}
              className="size-8 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            messages.map((m) => {
              const isAdmin = m.senderRole === "Admin";
              return (
                <div key={m.id} className={"flex gap-2.5 " + (isAdmin ? "flex-row-reverse text-right" : "")}>
                  <div className={"size-8 rounded-full grid place-items-center shrink-0 " + (isAdmin ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                    {isAdmin ? <ShieldAlert className="size-4" /> : <User className="size-4" />}
                  </div>
                  <div className="min-w-0 max-w-[80%]">
                    <div className="text-[11px] text-muted-foreground mb-0.5">
                      {isAdmin ? "You (Support)" : m.senderName || "Customer"} · {formatDateTime(m.createdAt)}
                    </div>
                    <div className={"inline-block text-xs leading-relaxed rounded-xl px-3 py-2 whitespace-pre-wrap " + (isAdmin ? "bg-primary/10 border border-primary/20 text-foreground" : "bg-muted border border-border text-foreground")}>
                      {m.message}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/20 shrink-0">
          {ticket?.status === "resolved" ? (
            <div className="flex items-center gap-2 text-xs text-success font-medium mb-2">
              <CheckCircle2 className="size-4" /> Ticket is resolved. Sending another reply keeps it resolved.
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground mb-2">
              Replying will send this message to the customer and mark the ticket <span className="font-semibold text-success">resolved</span>.
            </div>
          )}
          {err && (
            <div className="text-xs text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2 mb-2">
              {err}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              placeholder="How was this resolved? This text is shown to the customer…"
              className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm ring-focus resize-none"
            />
            <button
              type="button"
              onClick={resolve}
              disabled={busy || !reply.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Resolve
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

function AdminNotificationsPanel() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const res = await fetch(`${BACKEND}/api/admin/notifications`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load notifications");
      return (await res.json()) as any[];
    },
  });

  const send = async () => {
    setErr(null);
    setSent(false);
    if (!title.trim() || !message.trim()) {
      setErr("Title and message are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/broadcast`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), message: message.trim(), linkUrl: linkUrl.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to send broadcast");
      setSent(true);
      setTitle("");
      setMessage("");
      setLinkUrl("");
      await queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    } catch (e: any) {
      setErr(e.message || "Failed to send broadcast");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
    <div className="max-w-xl rounded-xl border border-border bg-surface shadow-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">New announcement</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        This notification is sent to <span className="font-medium text-foreground">all users</span> and appears in their
        notification bell.
      </p>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-foreground/90 block mb-1.5">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Scheduled maintenance on Sunday"
            className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/90 block mb-1.5">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Write the announcement shown to every user…"
            className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/90 block mb-1.5">Link (optional)</label>
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="/m/company"
            className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus mono"
          />
        </div>

        {err && (
          <div className="text-xs text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2">
            {err}
          </div>
        )}
        {sent && (
          <div className="text-xs text-success rounded-lg border border-success/30 bg-success/10 px-3.5 py-2 flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="size-3.5" /> Broadcast sent to all users.
          </div>
        )}

        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send to all users
        </button>
      </div>
    </div>

    {/* Everything sent so far */}
    <div className="rounded-xl border border-border bg-surface shadow-card overflow-x-auto">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Bell className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Sent notifications</h3>
        {history && <span className="text-[11px] text-muted-foreground">({history.length})</span>}
      </div>
      {historyLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : history && history.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[10px] mono uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 whitespace-nowrap">Title</th>
              <th className="text-left px-4 py-3">Message</th>
              <th className="text-left px-4 py-3 whitespace-nowrap">Recipient</th>
              <th className="text-left px-4 py-3 whitespace-nowrap">Sent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {history.map((n) => (
              <tr key={n.id} className="hover:bg-muted/30 transition-colors align-top">
                <td className="px-4 py-3 font-medium max-w-[220px]">
                  <div className="truncate">{n.title}</div>
                  <span
                    className={
                      "mt-1 inline-block text-[9px] mono uppercase px-1.5 py-0.5 rounded " +
                      (n.userId ? "bg-primary/10 text-primary" : "bg-accent/15 text-accent")
                    }
                  >
                    {n.userId ? "direct" : "broadcast"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[12px] text-muted-foreground max-w-[320px]">
                  <div className="line-clamp-2">{n.message}</div>
                </td>
                <td className="px-4 py-3 text-[12px] whitespace-nowrap">
                  {n.userId ? (
                    <>
                      <div className="font-medium text-foreground">{n.recipientName || "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{n.recipientEmail || ""}</div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">All users</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                  {formatDateTime(n.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="p-8 text-center text-sm text-muted-foreground">No notifications sent yet.</div>
      )}
    </div>
    </div>
  );
}

type Employee = {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  roleName: string | null;
  status: string | null;
  createdAt: string;
};

function EmployeesPanel() {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: async () => {
      const res = await fetch(`${BACKEND}/api/admin/employees`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load employees");
      return (await res.json()) as Employee[];
    },
  });

  const reset = () => {
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setPassword(""); setConfirm(""); setBlocked(false);
  };

  const create = async () => {
    setErr(null); setOk(null);
    if (!firstName.trim() || !email.trim() || !password) {
      setErr("First name, email and password are required.");
      return;
    }
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/employees`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          password,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create coordinator");

      // Honour the "block on creation" toggle with a follow-up status update.
      if (blocked && body.employee?.id) {
        await fetch(`${BACKEND}/api/admin/employees/${body.employee.id}/status`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "blocked" }),
        }).catch(() => {});
      }

      setOk(`Coordinator ${email.trim()} created.`);
      reset();
      await queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
    } catch (e: any) {
      setErr(e.message || "Failed to create coordinator");
    } finally {
      setBusy(false);
    }
  };

  const employees = data ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-6 items-start">
      {/* Create form */}
      <div className="rounded-xl border border-border bg-surface shadow-card p-6">
        <div className="flex items-center gap-2 mb-1">
          <UserPlus className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Add coordinator</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Coordinators sign in from the <span className="font-medium text-foreground">Admin</span> tab
          with the email and password you set here. They can manage registrations, tickets and
          notifications, but not services or employees.
        </p>

        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm ring-focus" placeholder="Asha" />
            </Field>
            <Field label="Last name">
              <input value={lastName} onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm ring-focus" placeholder="Rao" />
            </Field>
          </div>
          <Field label="Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm ring-focus" placeholder="asha@cloudcrest.com" />
          </Field>
          <Field label="Mobile">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel"
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm ring-focus" placeholder="90000 00000" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Create password">
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password"
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm ring-focus" placeholder="••••••••" />
            </Field>
            <Field label="Confirm password">
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password"
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm ring-focus" placeholder="••••••••" />
            </Field>
          </div>
          <Field label="Role">
            <div className="w-full bg-muted/60 border border-border rounded-lg px-3 py-2 text-sm text-foreground/80 flex items-center gap-2">
              <ShieldAlert className="size-3.5 text-primary" /> Coordinator
            </div>
          </Field>

          <label className="flex items-center gap-2.5 text-xs text-foreground/90 cursor-pointer select-none pt-0.5">
            <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)}
              className="size-4 rounded border-border accent-primary" />
            Block this account (coordinator can't sign in until unblocked)
          </label>

          {err && (
            <div className="text-xs text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2">{err}</div>
          )}
          {ok && (
            <div className="text-xs text-success rounded-lg border border-success/30 bg-success/10 px-3.5 py-2 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="size-3.5" /> {ok}
            </div>
          )}

          <button type="button" onClick={create} disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Create coordinator
          </button>
        </div>
      </div>

      {/* Coordinator list */}
      <div className="rounded-xl border border-border bg-surface shadow-card overflow-x-auto">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Users className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Coordinators</h3>
          {data && <span className="text-[11px] text-muted-foreground">({employees.length})</span>}
        </div>
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : employees.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[10px] mono uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 whitespace-nowrap">Name</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Contact</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-muted/30 transition-colors align-top">
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-foreground">
                      {`${e.firstName} ${e.lastName ?? ""}`.trim()}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Coordinator</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 text-[12px] text-foreground">
                      <Mail className="size-3 text-muted-foreground" /> {e.email}
                    </div>
                    {e.phone && (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                        <Phone className="size-3" /> {e.phone}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <StatusPill status={e.status || "active"} />
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <EmployeeStatusButton employee={e} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No coordinators yet. Add one using the form on the left.
          </div>
        )}
      </div>
    </div>
  );
}

function EmployeeStatusButton({ employee }: { employee: Employee }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const isBlocked = employee.status === "blocked";

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/employees/${employee.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: isBlocked ? "active" : "blocked" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update status");
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
    } catch (e: any) {
      alert(e.message || "Failed to update coordinator status");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm disabled:opacity-60 " +
        (isBlocked
          ? "bg-success/10 text-success hover:bg-success hover:text-white"
          : "bg-destructive/10 text-destructive hover:bg-destructive hover:text-white")
      }
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : isBlocked ? (
        <Unlock className="size-3.5" />
      ) : (
        <Lock className="size-3.5" />
      )}
      {isBlocked ? "Unblock" : "Block"}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-foreground/90 block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
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

function NotifyDialog({ request, onClose }: { request: AdminRequest; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(`Update on ${request.serviceTitle} (${request.referenceNo})`);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setErr(null);
    if (!title.trim() || !message.trim()) {
      setErr("Both a title and a message are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/notifications`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: request.userId,
          title: title.trim(),
          message: message.trim(),
          requestId: request.id,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to send notification");
      setSent(true);
      await queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      setTimeout(onClose, 1200);
    } catch (e: any) {
      setErr(e.message || "Failed to send notification");
    } finally {
      setBusy(false);
    }
  };

  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 animate-in fade-in-0 duration-200">
      <div className="fixed inset-0 bg-slate-950/90" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl border border-border/80 bg-surface shadow-2xl z-10 animate-in zoom-in-95 duration-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-navy/95 to-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-white/10">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2 text-white/80 text-xs">
              <User className="size-3.5" />
              <span className="truncate">
                {request.contactName || request.userName || request.contactEmail || request.userEmail}
              </span>
            </div>
            <h3 className="text-lg font-display font-bold leading-snug mt-0.5">Send Notification</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-[11px] mono uppercase tracking-wider text-muted-foreground">
            Re: {request.referenceNo} · {request.serviceTitle}
          </div>

          <div>
            <label className="text-xs font-medium text-foreground/90 block mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus"
              placeholder="Notification title"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground/90 block mb-1.5">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus"
              placeholder="e.g. Your DSC has been approved. Please upload the signed MoA to proceed with MCA filing."
            />
          </div>

          {err && (
            <div className="text-xs text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2">
              {err}
            </div>
          )}
          {sent && (
            <div className="text-xs text-success rounded-lg border border-success/30 bg-success/10 px-3.5 py-2 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="size-3.5" /> Notification sent to the applicant.
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/20 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy || sent}
            className="flex items-center gap-2 px-5 py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand hover:shadow-elev transition-all disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Send Notification
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
