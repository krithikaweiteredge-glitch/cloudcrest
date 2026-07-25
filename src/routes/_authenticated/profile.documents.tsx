import { createFileRoute } from "@tanstack/react-router";
import { assetUrl } from "@/lib/file-url";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FolderLock, FileText, Download, UploadCloud, Loader2 } from "lucide-react";
import { EmptyState } from "./profile.index";

export const Route = createFileRoute("/_authenticated/profile/documents")({
  component: DocsPage,
});

function DocsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
            Every file you've uploaded, encrypted and searchable across services.
          </p>
        </div>
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand hover:opacity-95 disabled:opacity-60 transition-opacity"
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
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : data && data.length > 0 ? (
          <ul className="divide-y divide-border">
            {data.map((d: any) => (
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
