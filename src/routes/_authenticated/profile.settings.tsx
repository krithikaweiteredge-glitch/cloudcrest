import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Save, CheckCircle2 } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/profile/settings")({
  component: SettingsPage,
});

const schema = z.object({
  full_name: z.string().trim().max(120).optional().or(z.literal("")),
  mobile: z.string().trim().max(20).optional().or(z.literal("")),
  company_name: z.string().trim().max(160).optional().or(z.literal("")),
  gstin: z.string().trim().max(20).optional().or(z.literal("")),
  pan: z.string().trim().max(10).optional().or(z.literal("")),
});

function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/profiles/me`);
      if (!res.ok) throw new Error("Failed to load profile");
      const data = await res.json();
      const business = data.businesses?.[0] || {};
      return {
        full_name: `${data.user?.firstName || ""} ${data.user?.lastName || ""}`.trim(),
        mobile: data.user?.phone || "",
        company_name: business.businessName || "",
        gstin: business.gstin || "",
        pan: business.pan || "",
      };
    },
    enabled: !!user,
  });

  const [form, setForm] = useState({ full_name: "", mobile: "", company_name: "", gstin: "", pan: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        mobile: profile.mobile ?? "",
        company_name: profile.company_name ?? "",
        gstin: profile.gstin ?? "",
        pan: profile.pan ?? "",
      });
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse(form);
      const nameParts = (parsed.full_name || "").trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/profiles/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone: parsed.mobile,
          businessName: parsed.company_name,
          legalName: parsed.company_name,
          gstin: parsed.gstin,
          pan: parsed.pan,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save profile changes");
      }
    },
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      setTimeout(() => setSaved(false), 2200);
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <h2 className="text-lg font-display font-semibold">Account Settings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Update your profile — prefills every registration you file.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Full name">
            <Input value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} placeholder="Rahul Sharma" />
          </Field>
          <Field label="Mobile">
            <Input value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} placeholder="+91 98xxx xxxxx" />
          </Field>
          <Field label="Email"><Input value={user?.email ?? ""} onChange={() => {}} disabled /></Field>
          <Field label="Company / Business name">
            <Input value={form.company_name} onChange={(v) => setForm({ ...form, company_name: v })} placeholder="Acme Pvt Ltd" />
          </Field>
          <Field label="GSTIN">
            <Input value={form.gstin} onChange={(v) => setForm({ ...form, gstin: v.toUpperCase() })} placeholder="27ABCDE1234F1Z5" />
          </Field>
          <Field label="PAN">
            <Input value={form.pan} onChange={(v) => setForm({ ...form, pan: v.toUpperCase() })} placeholder="ABCDE1234F" />
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={save.isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand disabled:opacity-60"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save changes
        </button>
        {saved && (
          <span className="text-[12px] text-success flex items-center gap-1">
            <CheckCircle2 className="size-3.5" /> Saved
          </span>
        )}
        {save.error && (
          <span className="text-[12px] text-destructive">
            {(save.error as Error).message}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-eyebrow mb-1.5">{label}</div>
      {children}
    </div>
  );
}
function Input({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus disabled:opacity-60"
    />
  );
}
