import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, ArrowRight } from "lucide-react";
import { StatusPill, EmptyState } from "./profile.index";

export const Route = createFileRoute("/_authenticated/profile/requests")({
  component: RequestsPage,
});

function RequestsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-semibold">My Registrations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every service you've submitted through Cloudcrest BM.
          </p>
        </div>
        <Link to="/" className="text-xs px-3 py-2 rounded-lg gradient-brand text-white shadow-brand font-semibold">
          New registration
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : data && data.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[10px] mono uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Service</th>
                <th className="text-left px-4 py-2.5">Reference</th>
                <th className="text-left px-4 py-2.5">Business</th>
                <th className="text-left px-4 py-2.5">Submitted</th>
                <th className="text-left px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="size-3.5 text-primary" />
                      <span className="font-medium">{r.service_title}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {r.authority} {r.form ? `· ${r.form}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 mono text-[12px]">{r.reference_no}</td>
                  <td className="px-4 py-3 text-[12px]">{r.business_name ?? "—"}</td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} />
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
    </div>
  );
}
