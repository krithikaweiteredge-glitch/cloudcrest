import { useState } from "react";
import { assetUrl } from "@/lib/file-url";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, ChevronRight, ChevronDown, Loader2, X, FileText, Settings2, Layers, FolderTree,
} from "lucide-react";

const BACKEND = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

async function call(path: string, method: string, body?: any) {
  const res = await fetch(`${BACKEND}/api/admin/catalog${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

type NameDialogState = {
  title: string;
  initial?: string;
  placeholder?: string;
  onSubmit: (value: string) => Promise<void>;
} | null;

export function AdminCatalogPanel() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [serviceDialog, setServiceDialog] = useState<
    { mode: "create"; subcategoryId: number } | { mode: "edit"; service: any } | null
  >(null);
  const [manageId, setManageId] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-catalog"],
    queryFn: async () => (await call("", "GET")) as any[],
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-catalog"] });
  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  const del = async (path: string, confirmMsg: string) => {
    if (!window.confirm(confirmMsg)) return;
    try {
      const r = await call(path, "DELETE");
      if (r?.message) setBanner(r.message);
      refresh();
    } catch (e: any) {
      setBanner(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderTree className="size-4 text-primary" />
          Manage the service catalog: categories, services, fees, page tabs and document checklists.
        </div>
        <button
          type="button"
          onClick={() =>
            setNameDialog({
              title: "New category",
              placeholder: "e.g. Tax Registration",
              onSubmit: async (name) => {
                await call("/categories", "POST", { name });
                refresh();
              },
            })
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand"
        >
          <Plus className="size-3.5" /> Category
        </button>
      </div>

      {banner && (
        <div className="text-xs rounded-lg border border-primary/25 bg-primary/8 text-primary px-3.5 py-2 flex items-center justify-between">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} className="text-primary/70 hover:text-primary">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface shadow-card divide-y divide-border">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading catalog…</div>
        ) : !data || data.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No categories yet. Add one to get started.</div>
        ) : (
          data.map((cat) => {
            const catKey = `c${cat.id}`;
            const catOpen = expanded[catKey] ?? true;
            return (
              <div key={cat.id}>
                {/* Category row */}
                <div className="flex items-center gap-2 px-4 py-3 bg-muted/30">
                  <button onClick={() => toggle(catKey)} className="text-muted-foreground hover:text-foreground">
                    {catOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </button>
                  <Layers className="size-4 text-primary shrink-0" />
                  <span className="font-semibold text-sm flex-1 truncate">{cat.name}</span>
                  <RowActions
                    onAdd={() =>
                      setNameDialog({
                        title: `New subcategory in "${cat.name}"`,
                        placeholder: "e.g. Company Registration",
                        onSubmit: async (name) => {
                          await call("/subcategories", "POST", { categoryId: cat.id, name });
                          setExpanded((p) => ({ ...p, [catKey]: true }));
                          refresh();
                        },
                      })
                    }
                    addLabel="Subcategory"
                    onEdit={() =>
                      setNameDialog({
                        title: "Rename category",
                        initial: cat.name,
                        onSubmit: async (name) => {
                          await call(`/categories/${cat.id}`, "PUT", { name });
                          refresh();
                        },
                      })
                    }
                    onDelete={() => del(`/categories/${cat.id}`, `Delete category "${cat.name}"?`)}
                  />
                </div>

                {catOpen &&
                  cat.subcategories.map((sub: any) => {
                    const subKey = `s${sub.id}`;
                    const subOpen = expanded[subKey] ?? true;
                    return (
                      <div key={sub.id} className="border-t border-border/60">
                        {/* Subcategory row */}
                        <div className="flex items-center gap-2 pl-9 pr-4 py-2.5">
                          <button onClick={() => toggle(subKey)} className="text-muted-foreground hover:text-foreground">
                            {subOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                          </button>
                          <span className="text-[13px] font-medium flex-1 truncate">{sub.name}</span>
                          <RowActions
                            onAdd={() => setServiceDialog({ mode: "create", subcategoryId: sub.id })}
                            addLabel="Service"
                            onEdit={() =>
                              setNameDialog({
                                title: "Rename subcategory",
                                initial: sub.name,
                                onSubmit: async (name) => {
                                  await call(`/subcategories/${sub.id}`, "PUT", { name });
                                  refresh();
                                },
                              })
                            }
                            onDelete={() => del(`/subcategories/${sub.id}`, `Delete subcategory "${sub.name}"?`)}
                          />
                        </div>

                        {subOpen && (
                          <ul className="pl-14 pr-4 pb-2 space-y-1">
                            {sub.services.length === 0 ? (
                              <li className="text-[12px] text-muted-foreground py-1">No services.</li>
                            ) : (
                              sub.services.map((svc: any) => (
                                <li
                                  key={svc.id}
                                  className="flex items-center gap-2 py-1.5 text-[13px] group border-b border-border/40 last:border-0"
                                >
                                  <FileText className="size-3.5 text-muted-foreground shrink-0" />
                                  <span className={"flex-1 truncate " + (svc.active ? "" : "line-through text-muted-foreground")}>
                                    {svc.name}
                                  </span>
                                  <span className="mono text-[11px] text-muted-foreground shrink-0">
                                    ₹{Number(svc.professionalFee).toLocaleString("en-IN")} + {Number(svc.gstPercent)}% GST
                                  </span>
                                  {!svc.active && (
                                    <span className="text-[9px] mono uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                      inactive
                                    </span>
                                  )}
                                  {svc.active && !svc.slug && (
                                    <span
                                      title="Add a URL slug so this service appears in the customer sidebar"
                                      className="text-[9px] mono uppercase px-1.5 py-0.5 rounded bg-warning/15 text-warning shrink-0"
                                    >
                                      not listed
                                    </span>
                                  )}
                                  {svc.slug && (
                                    <span className="text-[10px] mono text-muted-foreground shrink-0">/{svc.slug}</span>
                                  )}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <IconBtn title="Document checklist" onClick={() => setManageId(svc.id)}>
                                      <Settings2 className="size-3.5" />
                                    </IconBtn>
                                    <IconBtn title="Edit service" onClick={() => setServiceDialog({ mode: "edit", service: svc })}>
                                      <Pencil className="size-3.5" />
                                    </IconBtn>
                                    <IconBtn title="Delete service" danger onClick={() => del(`/services/${svc.id}`, `Delete service "${svc.name}"?`)}>
                                      <Trash2 className="size-3.5" />
                                    </IconBtn>
                                  </div>
                                </li>
                              ))
                            )}
                          </ul>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })
        )}
      </div>

      {nameDialog && <NameDialog {...nameDialog} onClose={() => setNameDialog(null)} />}
      {serviceDialog && (
        <ServiceDialog
          state={serviceDialog}
          onClose={() => setServiceDialog(null)}
          onSaved={() => {
            setServiceDialog(null);
            refresh();
          }}
        />
      )}
      {manageId != null && <ServiceManageDialog id={manageId} onClose={() => setManageId(null)} />}
    </div>
  );
}

function RowActions({
  onAdd,
  addLabel,
  onEdit,
  onDelete,
}: {
  onAdd: () => void;
  addLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
      >
        <Plus className="size-3" /> {addLabel}
      </button>
      <IconBtn title="Rename" onClick={onEdit}>
        <Pencil className="size-3.5" />
      </IconBtn>
      <IconBtn title="Delete" danger onClick={onDelete}>
        <Trash2 className="size-3.5" />
      </IconBtn>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={
        "size-6 grid place-items-center rounded-md transition-colors " +
        (danger ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive" : "text-muted-foreground hover:bg-muted hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in-0 duration-200">
      <div className="fixed inset-0 bg-slate-950/90" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border/80 bg-surface shadow-2xl z-10 animate-in zoom-in-95 duration-200 overflow-hidden my-auto">
        <div className="bg-gradient-to-r from-slate-900 via-navy/95 to-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-white/10">
          <h3 className="text-base font-display font-bold leading-snug truncate pr-4">{title}</h3>
          <button type="button" onClick={onClose} className="size-8 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors shrink-0">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

function NameDialog({
  title,
  initial,
  placeholder,
  onSubmit,
  onClose,
}: {
  title: string;
  initial?: string;
  placeholder?: string;
  onSubmit: (v: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={title} onClose={onClose}>
      <div className="p-6 space-y-3">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={placeholder}
          className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus"
        />
        {err && <div className="text-xs text-destructive">{err}</div>}
      </div>
      <div className="px-6 py-4 border-t border-border bg-muted/20 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-muted">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy} className="flex items-center gap-2 px-5 py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand disabled:opacity-60">
          {busy && <Loader2 className="size-3.5 animate-spin" />} Save
        </button>
      </div>
    </Shell>
  );
}

function ServiceDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { mode: "create"; subcategoryId: number } | { mode: "edit"; service: any };
  onClose: () => void;
  onSaved: () => void;
}) {
  const svc = state.mode === "edit" ? state.service : null;
  const [name, setName] = useState(svc?.name || "");
  const [description, setDescription] = useState(svc?.description || "");
  const [active, setActive] = useState(svc ? !!svc.active : true);
  const [slug, setSlug] = useState(svc?.slug || "");
  const [shortTitle, setShortTitle] = useState(svc?.shortTitle || "");
  const [authority, setAuthority] = useState(svc?.authority || "");
  const [formNo, setFormNo] = useState(svc?.formNo || "");
  const [icon, setIcon] = useState(svc?.icon || "");
  const [actsRulesPdfs, setActsRulesPdfs] = useState<{ name: string; url: string }[]>(() => {
    if (!svc?.actsRulesPdfs) return [];
    try {
      return JSON.parse(svc.actsRulesPdfs);
    } catch {
      return [];
    }
  });
  const [uploadingPdf, setUploadingPdf] = useState(false);

  // Fee lines shown to the customer. Seeded from any saved custom lines, else
  // from the service's standard Professional / Government / GST fees — so the
  // editor always shows the fees this service currently has, ready to edit,
  // extend or remove.
  const [feeLines, setFeeLines] = useState<{ label: string; amount: string }[]>(() => {
    if (svc?.feeLines) {
      try {
        const parsed = JSON.parse(svc.feeLines);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((l: any) => ({ label: String(l.label ?? ""), amount: String(l.amount ?? "") }));
        }
      } catch {
        /* fall through to seeding from the standard fees */
      }
    }
    const num = (v: any) => (Number(v) || 0);
    const prof = num(svc?.professionalFee);
    const govt = num(svc?.govtFee);
    const gstPct = num(svc?.gstPercent);
    const seeded: { label: string; amount: string }[] = [];
    if (prof) seeded.push({ label: "Professional Fee", amount: String(prof) });
    if (govt) seeded.push({ label: "Government Fee", amount: String(govt) });
    if (gstPct) seeded.push({ label: `GST @ ${gstPct}%`, amount: String(Math.round((prof * gstPct) / 100)) });
    return seeded;
  });

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/admin/catalog/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const d = await res.json();
      setActsRulesPdfs((prev) => [...prev, { name: d.name, url: d.url }]);
    } catch (e: any) {
      alert("Error uploading PDF: " + e.message);
    } finally {
      setUploadingPdf(false);
    }
  };

  const [tabsList, setTabsList] = useState<any[]>(() => {
    if (svc?.tabs) {
      try {
        return JSON.parse(svc.tabs);
      } catch {
        // Fallback
      }
    }
    return [
      { id: "about", title: "About", content: svc?.description || "", visible: true },
      { id: "who", title: "Who can Apply", content: svc?.whoCanApply || "", visible: true },
      { id: "documents", title: "Documents", content: "", visible: true },
      { id: "acts", title: "Acts and Rules", content: svc?.actsRules || "", visible: true }
    ];
  });

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setErr("Service name is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // The fee-line editor is the single source of fees. Its total feeds the
      // required professional_fee column (used as the fallback / list price);
      // govt & GST columns are folded into the lines, so they're zeroed here.
      const cleanedFeeLines = feeLines
        .filter((l) => l.label.trim())
        .map((l) => ({ label: l.label.trim(), amount: Number(l.amount) || 0 }));
      const feeTotal = cleanedFeeLines.reduce((sum, l) => sum + l.amount, 0);

      const payload = {
        name,
        description: tabsList.find((t) => t.id === "about")?.content || "",
        professionalFee: String(feeTotal),
        govtFee: "0",
        gstPercent: "0",
        active,
        slug,
        shortTitle,
        authority,
        formNo,
        icon,
        whoCanApply: tabsList.find((t) => t.id === "who")?.content || "",
        actsRules: tabsList.find((t) => t.id === "acts")?.content || "",
        actsRulesPdfs: JSON.stringify(actsRulesPdfs),
        tabs: JSON.stringify(tabsList),
        feeLines: JSON.stringify(cleanedFeeLines),
      };
      if (state.mode === "create") {
        await call("/services", "POST", { ...payload, subcategoryId: state.subcategoryId });
      } else {
        await call(`/services/${svc.id}`, "PUT", payload);
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={state.mode === "create" ? "New service" : "Edit service"} onClose={onClose}>
      <div className="p-6 space-y-3 max-h-[70vh] overflow-y-auto">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
        </Field>
        {/* Fee breakdown — the single place fees are managed */}
        <div className="pt-3 mt-1 border-t border-border space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Fee breakdown shown to customer
            </span>
            <button
              type="button"
              onClick={() => setFeeLines((prev) => [...prev, { label: "", amount: "" }])}
              className="text-xs text-primary font-semibold hover:underline cursor-pointer"
            >
              + Add fee line
            </button>
          </div>

          {feeLines.length === 0 ? (
            <div className="text-xs text-muted-foreground italic border border-dashed border-border rounded-lg p-3">
              No custom lines — the customer sees Professional, Government and GST fees from the
              fields above. Add a line to override that with your own breakdown.
            </div>
          ) : (
            <div className="space-y-2">
              {feeLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={line.label}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFeeLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, label: val } : l)),
                      );
                    }}
                    placeholder="e.g. Professional Fee"
                    className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm ring-focus"
                  />
                  <input
                    value={line.amount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFeeLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, amount: val } : l)),
                      );
                    }}
                    inputMode="decimal"
                    placeholder="0"
                    className="w-28 bg-input border border-border rounded-lg px-3 py-2 text-sm ring-focus mono"
                  />
                  <button
                    type="button"
                    onClick={() => setFeeLines((prev) => prev.filter((_, i) => i !== idx))}
                    title="Delete fee line"
                    className="p-2 text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                <span className="font-semibold">Total shown to customer</span>
                <span className="mono font-semibold text-primary">
                  ₹{" "}
                  {feeLines
                    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0)
                    .toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="pt-3 mt-1 border-t border-border space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Customer listing</div>
          <Field label="URL slug — required to show in the customer sidebar">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. geographical-indication"
              className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus mono"
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Short label">
              <input value={shortTitle} onChange={(e) => setShortTitle(e.target.value)} placeholder="GI Tag" className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
            </Field>
            <Field label="Authority">
              <input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="IP India" className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
            </Field>
            <Field label="Form">
              <input value={formNo} onChange={(e) => setFormNo(e.target.value)} placeholder="GI-1" className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
            </Field>
          </div>
          <Field label="Icon (lucide name, e.g. Award, Shield, Wallet)">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="Award"
              className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus mono"
            />
          </Field>
        </div>

        <div className="pt-3 mt-1 border-t border-border space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Service Page Tabs Configuration</span>
            <button
              type="button"
              onClick={() => {
                const newId = `custom_${Date.now()}`;
                setTabsList((prev) => [
                  ...prev,
                  { id: newId, title: "New Tab", content: "", visible: true, isCustom: true }
                ]);
              }}
              className="text-xs text-primary font-semibold hover:underline cursor-pointer"
            >
              + Add Custom Tab
            </button>
          </div>

          <div className="space-y-4">
            {tabsList.map((tab, idx) => {
              const isDefault = !tab.isCustom;
              return (
                <div key={tab.id} className="border border-border/85 rounded-xl p-4 bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={tab.visible}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setTabsList((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, visible: val } : item))
                          );
                        }}
                        className="size-4"
                      />
                      <span>Enable Tab</span>
                    </label>
                    
                    {!isDefault && (
                      <button
                        type="button"
                        onClick={() => setTabsList((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-destructive hover:underline font-semibold cursor-pointer"
                      >
                        Delete Tab
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Field label="Tab Title">
                      <input
                        type="text"
                        value={tab.title}
                        disabled={isDefault}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTabsList((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, title: val } : item))
                          );
                        }}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm disabled:opacity-75 disabled:bg-muted/10 font-semibold"
                        placeholder="e.g. Overview"
                      />
                    </Field>

                    {tab.id !== "documents" && (
                      <Field label="Tab Content">
                        <textarea
                          value={tab.content}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTabsList((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, content: val } : item))
                            );
                          }}
                          rows={3}
                          className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus"
                          placeholder="Enter tab content details..."
                        />
                      </Field>
                    )}

                    {tab.id === "acts" && (
                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                          <span>Acts & Rules PDF Downloads</span>
                          <label className="text-xs text-primary font-medium cursor-pointer hover:underline">
                            {uploadingPdf ? "Uploading..." : "+ Upload PDF"}
                            <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} disabled={uploadingPdf} />
                          </label>
                        </div>
                        {actsRulesPdfs.length === 0 ? (
                          <div className="text-xs text-muted-foreground italic border border-dashed border-border rounded-lg p-3 text-center">
                            No PDFs attached yet.
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[120px] overflow-y-auto">
                            {actsRulesPdfs.map((pdf, pIdx) => (
                              <div key={pIdx} className="flex items-center gap-2 bg-muted/40 border border-border/60 rounded-lg p-2 text-[11px]">
                                <input
                                  type="text"
                                  value={pdf.name}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setActsRulesPdfs((prev) =>
                                      prev.map((item, i) => (i === pIdx ? { ...item, name: val } : item))
                                    );
                                  }}
                                  className="flex-1 bg-input border border-border rounded px-2 py-0.5"
                                  placeholder="Display Name"
                                />
                                <a href={assetUrl(pdf.url)} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate max-w-[100px]">
                                  View
                                </a>
                                <button
                                  type="button"
                                  onClick={() => setActsRulesPdfs((prev) => prev.filter((_, i) => i !== pIdx))}
                                  className="text-destructive font-semibold hover:text-red-500 cursor-pointer"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4" />
          Active (available to customers)
        </label>
        {err && <div className="text-xs text-destructive">{err}</div>}
      </div>
      <div className="px-6 py-4 border-t border-border bg-muted/20 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-muted">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy} className="flex items-center gap-2 px-5 py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand disabled:opacity-60">
          {busy && <Loader2 className="size-3.5 animate-spin" />} Save
        </button>
      </div>
    </Shell>
  );
}

function ServiceManageDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-service", id],
    queryFn: async () => await call(`/services/${id}`, "GET"),
  });
  const [docName, setDocName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-service", id] });
    qc.invalidateQueries({ queryKey: ["admin-catalog"] });
  };

  const run = async (fn: () => Promise<any>) => {
    setErr(null);
    try {
      await fn();
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const docs: any[] = data?.documents || [];

  return (
    <Shell title={data?.service?.name || "Service Setup Config"} onClose={onClose}>
      <div className="p-6 space-y-6 max-h-[72vh] overflow-y-auto">
        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-6">Loading…</div>
        ) : (
          <>
            {/* Document checklist */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Required Document Checklist</h4>
              <ul className="space-y-1.5 mb-2">
                {docs.length === 0 && <li className="text-xs text-muted-foreground italic">No documents configured.</li>}
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-[13px] bg-muted/40 rounded-lg px-3 py-1.5 border border-border/40">
                    <FileText className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate font-medium">{d.name}</span>
                    <IconBtn title="Remove" danger onClick={() => run(() => call(`/documents/${d.id}`, "DELETE"))}>
                      <Trash2 className="size-3.5" />
                    </IconBtn>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <input
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="e.g. PAN Card of Directors"
                  className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm ring-focus"
                />
                <button
                  type="button"
                  onClick={() => docName.trim() && run(async () => { await call(`/services/${id}/documents`, "POST", { name: docName }); setDocName(""); })}
                  className="px-3 py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="size-3.5" /> Add Doc
                </button>
              </div>
            </div>

            {err && <div className="text-xs text-destructive">{err}</div>}
          </>
        )}
      </div>
      <div className="px-6 py-4 border-t border-border bg-muted/20 flex justify-end">
        <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-muted cursor-pointer">
          Done
        </button>
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-foreground/80 block mb-1">{label}</label>
      {children}
    </div>
  );
}
