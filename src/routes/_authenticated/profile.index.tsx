import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, Receipt, FolderLock, Plus, Building2, MapPin,
  CreditCard, Landmark, Mail, Phone, CalendarDays, AlertTriangle, ShieldCheck,
} from "lucide-react";
import { SupportTicketsCard } from "@/components/support-tickets";

export const Route = createFileRoute("/_authenticated/profile/")({
  component: Overview,
});

const BACKEND = import.meta.env.VITE_BACKEND_URL || "";
const withCreds = { credentials: "include" as const };

type Business = {
  businessName?: string;
  legalName?: string;
  pan?: string;
  gstin?: string;
  cin?: string;
  incorporationDate?: string;
  state?: string;
  city?: string;
  pincode?: string;
  address?: string;
  postalAddress?: string;
};
type ProfileMe = {
  user?: { firstName?: string; lastName?: string; email?: string; phone?: string; status?: string; createdAt?: string };
  businesses?: Business[];
};

function Overview() {
  const { data } = useQuery({
    queryKey: ["profile-overview"],
    queryFn: async () => {
      const [meRes, reqsRes, ordersRes, docsRes] = await Promise.all([
        fetch(`${BACKEND}/api/profiles/me`, withCreds),
        fetch(`${BACKEND}/api/requests`, withCreds),
        fetch(`${BACKEND}/api/orders/my-orders`, withCreds),
        fetch(`${BACKEND}/api/requests/documents`, withCreds),
      ]);
      const me: ProfileMe = meRes.ok ? await meRes.json() : {};
      const reqsList = reqsRes.ok ? await reqsRes.json() : [];
      const ordersList = ordersRes.ok ? await ordersRes.json() : [];
      const docsList = docsRes.ok ? await docsRes.json() : [];
      return {
        me,
        requestCount: Array.isArray(reqsList) ? reqsList.length : 0,
        orderCount: Array.isArray(ordersList) ? ordersList.length : 0,
        docCount: Array.isArray(docsList) ? docsList.length : 0,
      };
    },
  });

  const me = data?.me;
  const user = me?.user;
  const business = me?.businesses?.[0];
  const isBusiness = !!business?.cin || !!business?.businessName;

  const stats = [
    { label: "Registrations", value: data?.requestCount ?? 0, icon: FileText, to: "/profile/requests" },
    { label: "Invoices", value: data?.orderCount ?? 0, icon: Receipt, to: "/profile/orders" },
    { label: "Documents", value: data?.docCount ?? 0, icon: FolderLock, to: "/profile/documents" },
  ];

  const fmtDate = (d?: string) => {
    if (!d) return "—";
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-GB");
  };

  const address = business?.postalAddress || business?.address;
  const addressLine = [address, business?.city, business?.state, business?.pincode]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6 animate-in-up">
      {/* ---- Details + identity ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* Left: company details as a timeline */}
        <div className="rounded-2xl border border-border bg-surface shadow-card p-6">
          <div className="label-eyebrow text-primary mb-4">
            {isBusiness ? "Company details" : "Personal details"}
          </div>
          <ol className="relative border-l border-dashed border-border pl-6 space-y-6">
            {isBusiness && (
              <TimelineRow icon={Building2} label="Legal name" value={business?.legalName || business?.businessName || "—"} />
            )}
            {isBusiness && (
              <TimelineRow icon={CalendarDays} label="Incorporation date" value={fmtDate(business?.incorporationDate)} />
            )}
            <TimelineRow icon={MapPin} label="Registered address" value={addressLine || "Not added yet"} muted={!addressLine} />
            <TimelineRow icon={Mail} label="Registered email" value={user?.email || "—"} />
            <TimelineRow icon={Phone} label="Phone" value={user?.phone || "Not added yet"} muted={!user?.phone} />
          </ol>
        </div>

        {/* Right: identity cards */}
        <div className="space-y-4">
          {isBusiness && (
            <IdentityCard
              icon={CreditCard}
              label="PAN"
              value={business?.pan}
              verified={!!business?.pan}
            />
          )}
          {isBusiness && (
            <IdentityCard
              icon={Landmark}
              label="GSTIN"
              value={business?.gstin}
              verified={!!business?.gstin}
            />
          )}
          <IdentityCard icon={Mail} label="Registered email" value={user?.email} verified={!!user?.email} />
        </div>
      </div>

      {/* ---- Stat tiles ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className="group rounded-2xl border border-border bg-surface shadow-card p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-elev hover:border-primary/40"
          >
            <div className="size-10 rounded-xl grid place-items-center mb-3 bg-primary/10 text-primary transition-all duration-300 group-hover:gradient-brand group-hover:text-white group-hover:shadow-brand">
              <s.icon className="size-5" />
            </div>
            <div className="text-3xl font-display font-semibold">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </Link>
        ))}
      </div>

      <SupportTicketsCard />
    </div>
  );
}

function TimelineRow({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <li className="relative">
      <span className="absolute -left-[31px] top-0 size-6 rounded-full bg-primary/10 border-2 border-surface grid place-items-center text-primary">
        <Icon className="size-3" />
      </span>
      <div className="label-eyebrow text-muted-foreground">{label}</div>
      <div className={"text-sm mt-0.5 " + (muted ? "text-muted-foreground italic" : "text-foreground font-medium")}>
        {value}
      </div>
    </li>
  );
}

function IdentityCard({
  icon: Icon,
  label,
  value,
  verified,
}: {
  icon: typeof CreditCard;
  label: string;
  value?: string;
  verified?: boolean;
}) {
  const has = !!(value && value.trim());
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-card p-4 hover-lift">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 label-eyebrow text-muted-foreground">
          <Icon className="size-3.5 text-primary" /> {label}
        </div>
        {has ? (
          verified ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success">
              <ShieldCheck className="size-3.5" /> Verified
            </span>
          ) : null
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning">
            <AlertTriangle className="size-3.5" /> Missing
          </span>
        )}
      </div>
      {has ? (
        <div className="mt-1.5 text-sm font-semibold mono tracking-wide break-all">{value}</div>
      ) : (
        <Link to="/profile/settings" className="mt-1.5 inline-block text-sm text-primary font-semibold hover:underline">
          Add now
        </Link>
      )}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    submitted: "bg-primary/12 text-primary",
    "in-review": "bg-warning/15 text-warning",
    filed: "bg-accent/15 text-accent",
    approved: "bg-success/15 text-success",
    paid: "bg-success/15 text-success",
    pending: "bg-warning/15 text-warning",
    resolved: "bg-success/15 text-success",
    closed: "bg-muted text-muted-foreground",
    rejected: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={"text-[10px] mono uppercase tracking-wider px-2 py-1 rounded-md " + (map[status] ?? "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: typeof FileText;
  title: string;
  body: string;
  cta?: { label: string; to: string };
}) {
  return (
    <div className="p-10 text-center flex flex-col items-center gap-3">
      <div className="size-12 rounded-full bg-muted grid place-items-center text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-[12px] text-muted-foreground max-w-xs">{body}</div>
      {cta && (
        <Link to={cta.to as "/"} className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand">
          <Plus className="size-3.5" /> {cta.label}
        </Link>
      )}
    </div>
  );
}
