import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, Download } from "lucide-react";
import { StatusPill, EmptyState } from "./profile.index";

export const Route = createFileRoute("/_authenticated/profile/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/orders/my-orders`);
      if (!res.ok) throw new Error("Failed to load orders");
      const list = await res.json();
      return list.map((o: any) => ({
        id: o.id,
        invoice_no: o.orderNo,
        description: o.serviceName ? `${o.serviceName} Registration` : "Filing service",
        amount_inr: o.total || 0,
        status: o.status,
        created_at: o.createdAt,
      }));
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold">Orders &amp; Invoices</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every payment tied to your Cloudcrest BM filings.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : data && data.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[10px] mono uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Invoice</th>
                <th className="text-left px-4 py-2.5">Description</th>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-right px-4 py-2.5">Amount</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((o: any) => (
                <tr key={o.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 mono text-[12px]">{o.invoice_no}</td>
                  <td className="px-4 py-3 text-[13px]">{o.description}</td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right mono font-semibold">
                    ₹ {Number(o.amount_inr).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3"><StatusPill status={o.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-[12px] text-primary inline-flex items-center gap-1 hover:underline">
                      <Download className="size-3" /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={Receipt} title="No invoices yet" body="Once you complete a paid filing, invoices will appear here." />
        )}
      </div>
    </div>
  );
}
