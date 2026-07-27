import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Receipt, Download, FileText } from "lucide-react";
import { StatusPill, EmptyState } from "./profile.index";
import { BrandLoader } from "@/components/brand-loader";

export const Route = createFileRoute("/_authenticated/profile/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const [reqRes, ordRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests`, { credentials: "include" }),
        fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/orders/my-orders`, { credentials: "include" }),
      ]);

      const reqs = reqRes.ok ? await reqRes.json() : [];
      const ords = ordRes.ok ? await ordRes.json() : [];

      const requestOrders = reqs.map((r: any) => ({
        id: r.id,
        invoice_no: r.referenceNo,
        description: r.serviceTitle,
        amount_inr: r.total || 5499,
        status: r.status || "submitted",
        created_at: r.createdAt,
        pdfUrl: `${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/${r.id}/pdf`,
        raw: r,
      }));

      const legacyOrders = ords.map((o: any) => ({
        id: `ord-${o.id}`,
        invoice_no: o.orderNo,
        description: o.serviceName ? `${o.serviceName} Registration` : "Filing service",
        amount_inr: o.total || 0,
        status: o.status || "pending",
        created_at: o.createdAt,
        pdfUrl: null,
        raw: o,
      }));

      return [...requestOrders, ...legacyOrders];
    },
  });

  // Fetch the summary as a blob and save it to the device, so the PDF lands in
  // Downloads rather than opening in a browser tab.
  const saveBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async (orderItem: any) => {
    try {
      let res: Response;
      if (orderItem.pdfUrl) {
        res = await fetch(orderItem.pdfUrl, { credentials: "include" });
      } else {
        // Legacy orders have no request id — generate a summary from what we have.
        res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/summary/pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: orderItem.description,
            form: "Filing Order",
            capital: orderItem.amount_inr,
            total: orderItem.amount_inr,
          }),
        });
      }
      if (!res.ok) throw new Error("Failed to generate summary");
      saveBlob(await res.blob(), `Summary-${orderItem.invoice_no}.pdf`);
    } catch (err) {
      console.error("Failed to download PDF summary", err);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold">Orders &amp; Invoices</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          View your registered service orders and download official PDF order summaries.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-card overflow-x-auto">
        {isLoading ? (
          <BrandLoader />
        ) : data && data.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[10px] mono uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 whitespace-nowrap">Reference / Invoice</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Service Description</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Date</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">Amount</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((o: any) => (
                <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3.5 mono text-[12px] font-bold text-foreground/90 whitespace-nowrap">{o.invoice_no}</td>
                  <td className="px-4 py-3.5 text-[13px] font-medium whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <FileText className="size-3.5 text-primary shrink-0" />
                      <span>{o.description}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-[12px] text-muted-foreground whitespace-nowrap">
                    {new Date(o.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="px-4 py-3.5 text-right mono font-semibold text-foreground whitespace-nowrap">
                    ₹{Number(o.amount_inr).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap"><StatusPill status={o.status} /></td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(o)}
                      title={`Download PDF summary for ${o.invoice_no}`}
                      aria-label={`Download PDF summary for ${o.invoice_no}`}
                      className="text-primary inline-grid place-items-center size-8 rounded-lg bg-primary/10 hover:bg-primary hover:text-white transition-all shadow-sm shrink-0"
                    >
                      <Download className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={Receipt} title="No orders or invoices yet" body="Once you complete a service registration, order summaries and invoices will appear here." />
        )}
      </div>
    </div>
  );
}
