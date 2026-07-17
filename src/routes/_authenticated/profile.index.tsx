import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Receipt, FolderLock, ArrowRight, Plus, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile/")({
  component: Overview,
});

function Overview() {
  const { data } = useQuery({
    queryKey: ["profile-overview"],
    queryFn: async () => {
      const [reqs, orders, docs] = await Promise.all([
        supabase.from("service_requests").select("id, service_title, status, created_at, reference_no").order("created_at", { ascending: false }).limit(4),
        supabase.from("orders").select("id, invoice_no, amount_inr, status, created_at").order("created_at", { ascending: false }).limit(3),
        supabase.from("request_documents").select("id", { count: "exact", head: true }),
      ]);
      return {
        requests: reqs.data ?? [],
        orders: orders.data ?? [],
        docCount: docs.count ?? 0,
      };
    },
  });

  const stats = [
    { label: "Registrations", value: data?.requests.length ?? 0, icon: FileText, tint: "primary" },
    { label: "Invoices", value: data?.orders.length ?? 0, icon: Receipt, tint: "accent" },
    { label: "Documents", value: data?.docCount ?? 0, icon: FolderLock, tint: "success" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface shadow-card p-5 hover-lift">
            <div className={"size-9 rounded-lg grid place-items-center mb-3 bg-primary/10 text-primary"}>
              <s.icon className="size-4" />
            </div>
            <div className="text-2xl font-display font-semibold">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Recent registrations</h3>
          <Link to="/profile/requests" className="text-[12px] text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="size-3" />
          </Link>
        </div>
        {data?.requests.length ? (
          <ul className="divide-y divide-border">
            {data.requests.map((r) => (
              <li key={r.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center">
                  <FileText className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.service_title}</div>
                  <div className="text-[11px] text-muted-foreground mono">
                    {r.reference_no} · {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={FileText}
            title="No registrations yet"
            body="Start with Company Registration or any service from the sidebar."
            cta={{ label: "Browse services", to: "/" }}
          />
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Recent invoices</h3>
          <Link to="/profile/orders" className="text-[12px] text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="size-3" />
          </Link>
        </div>
        {data?.orders.length ? (
          <ul className="divide-y divide-border">
            {data.orders.map((o) => (
              <li key={o.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className="size-8 rounded-md bg-accent/10 text-accent grid place-items-center">
                  <Receipt className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate mono">{o.invoice_no}</div>
                  <div className="text-[11px] text-muted-foreground">
                    <Clock className="inline size-3 -mt-0.5" /> {new Date(o.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-sm font-semibold mono">₹ {Number(o.amount_inr).toLocaleString("en-IN")}</div>
                <StatusPill status={o.status} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Receipt} title="No invoices yet" body="Invoices appear here after your first paid filing." />
        )}
      </div>
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
