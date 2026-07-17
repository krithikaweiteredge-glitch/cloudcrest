import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FolderLock, FileText, Download } from "lucide-react";
import { EmptyState } from "./profile.index";

export const Route = createFileRoute("/_authenticated/profile/documents")({
  component: DocsPage,
});

function DocsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-docs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_documents")
        .select("*, service_requests(service_title, reference_no)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const openDoc = async (path: string) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold">Documents Vault</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every file you've uploaded, encrypted and searchable across services.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : data && data.length > 0 ? (
          <ul className="divide-y divide-border">
            {data.map((d) => (
              <li key={d.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                  <FileText className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{d.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {d.service_requests?.service_title ?? "Unattached"}
                    {d.size_bytes ? ` · ${(d.size_bytes / 1024).toFixed(0)} KB` : ""}
                    {" · "}
                    {new Date(d.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => openDoc(d.storage_path)}
                  className="text-[12px] text-primary inline-flex items-center gap-1 hover:underline"
                >
                  <Download className="size-3" /> Open
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={FolderLock} title="Vault is empty" body="Documents uploaded during any registration appear here — reuse them across services." />
        )}
      </div>
    </div>
  );
}
