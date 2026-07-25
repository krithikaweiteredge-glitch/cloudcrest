import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  Loader2,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
  Calendar,
  MapPin,
  CreditCard,
  Hash,
  User,
  Mail,
  Building2,
  Pencil,
  RotateCw,
  Phone,
} from "lucide-react";
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
  cin: z.string().trim().max(21).optional().or(z.literal("")),
  incorporation_date: z.string().trim().optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
  postal_address: z.string().trim().optional().or(z.literal("")),
  aadhaar: z.string().trim().max(20).optional().or(z.literal("")),
  passport: z.string().trim().max(50).optional().or(z.literal("")),
});

function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/profiles/me`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load profile");
      const data = await res.json();
      const business = data.businesses?.[0] || {};
      return {
        full_name: `${data.user?.firstName || ""} ${data.user?.lastName || ""}`.trim(),
        mobile: data.user?.phone || "",
        company_name: business.businessName || "",
        gstin: business.gstin || "",
        pan: business.pan || "",
        cin: business.cin || "",
        incorporation_date: business.incorporationDate || "",
        address: business.address || "",
        postal_address: business.postalAddress || "",
        directors: business.directors ? JSON.parse(business.directors) : [],
        aadhaar: business.aadhaar || "",
        passport: business.passport || "",
        isBusiness: !!business.cin,
      };
    },
    enabled: !!user,
  });

  const [form, setForm] = useState({
    full_name: "",
    mobile: "",
    company_name: "",
    gstin: "",
    pan: "",
    cin: "",
    incorporation_date: "",
    address: "",
    postal_address: "",
    aadhaar: "",
    passport: "",
  });
  
  const [directors, setDirectors] = useState<{ din: string; name: string; dob: string; fathersName: string; status: string }[]>([]);
  
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "info"; text: string } | null>(null);
  
  const [editingPostal, setEditingPostal] = useState(false);
  const [editingRegistered, setEditingRegistered] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        mobile: profile.mobile ?? "",
        company_name: profile.company_name ?? "",
        gstin: profile.gstin ?? "",
        pan: profile.pan ?? "",
        cin: profile.cin ?? "",
        incorporation_date: profile.incorporation_date ?? "",
        address: profile.address ?? "",
        postal_address: profile.postal_address ?? "",
        aadhaar: profile.aadhaar ?? "",
        passport: profile.passport ?? "",
      });
      if (profile.directors && Array.isArray(profile.directors)) {
        setDirectors(profile.directors);
      } else {
        setDirectors([]);
      }
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      setMsg(null);
      const parsed = schema.parse(form);
      const nameParts = (parsed.full_name || "").trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/profiles/me`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone: parsed.mobile,
          businessName: parsed.company_name,
          legalName: parsed.company_name,
          gstin: parsed.gstin,
          pan: parsed.pan,
          cin: parsed.cin,
          incorporationDate: parsed.incorporation_date || null,
          address: parsed.address,
          postalAddress: parsed.postal_address,
          directors: JSON.stringify(directors.filter(d => d.name || d.din)),
          aadhaar: parsed.aadhaar,
          passport: parsed.passport,
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
      qc.invalidateQueries({ queryKey: ["profile-layout"] });
      setTimeout(() => setSaved(false), 2200);
    },
    onError: (err: any) => {
      setMsg({ type: "err", text: err.message || "Failed to save changes" });
    }
  });

  const syncMca = async () => {
    if (!form.cin) {
      setMsg({ type: "err", text: "Please enter a CIN number first in Registry Settings." });
      return;
    }
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/mca/company-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cin: form.cin }),
      });
      if (!res.ok) throw new Error("Failed to fetch MCA details");
      const data = await res.json();
      if (data.found && data.company) {
        const c = data.company;
        setForm(f => ({
          ...f,
          company_name: c.name || f.company_name,
          incorporation_date: c.incorporationDate || f.incorporation_date,
          address: c.address || f.address,
          postal_address: c.postalAddress || c.address || f.postal_address,
        }));
        if (c.directors) {
          setDirectors(JSON.parse(c.directors));
        }
        setMsg({ type: "info", text: "Successfully synchronized with MCA registry!" });
      } else {
        setMsg({ type: "err", text: "Company details not found in MCA registry." });
      }
    } catch (e: any) {
      setMsg({ type: "err", text: e.message || "Failed to update MCA details" });
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <form
      className="space-y-8 animate-in-up"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          {profile?.isBusiness ? (
            <>
              <Building2 className="size-5 text-primary" />
              <span>Company Profile Settings</span>
            </>
          ) : (
            <>
              <User className="size-5 text-primary" />
              <span>Account Settings</span>
            </>
          )}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {profile?.isBusiness
            ? "Update your official company registration details and manage director information."
            : "Manage your personal contact details and identification credentials."}
        </p>
      </div>

      {profile?.isBusiness ? (
        /* ================== TIMELINE BUSINESS VIEW ================== */
        <div className="space-y-8">
          
          {/* Registry Configuration section */}
          <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
            <h3 className="text-sm font-semibold border-b border-border pb-2 text-foreground/90 flex items-center gap-1.5">
              <CreditCard className="size-4 text-primary" /> Registry Settings
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="CIN Number">
                <Input value={form.cin} onChange={(v) => setForm({ ...form, cin: v.toUpperCase() })} placeholder="U62013TS2023PTC176510" />
              </Field>
              <Field label="Company PAN">
                <Input value={form.pan} onChange={(v) => setForm({ ...form, pan: v.toUpperCase() })} placeholder="ABCDE1234F" />
              </Field>
              <Field label="GSTIN (Optional)">
                <Input value={form.gstin} onChange={(v) => setForm({ ...form, gstin: v.toUpperCase() })} placeholder="27ABCDE1234F1Z5" />
              </Field>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4 border-t border-border pt-4">
              <Field label="Manual Incorporation Date">
                <input
                  type="date"
                  value={form.incorporation_date}
                  onChange={(e) => setForm({ ...form, incorporation_date: e.target.value })}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </Field>
              <Field label="Manual Company Name">
                <Input value={form.company_name} onChange={(v) => setForm({ ...form, company_name: v })} placeholder="Weiter Edge Technologies Pvt Ltd" />
              </Field>
            </div>
          </div>

          {/* Contact Information section */}
          <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
            <h3 className="text-sm font-semibold border-b border-border pb-2 text-foreground/90 flex items-center gap-1.5">
              <Phone className="size-4 text-primary" /> Contact Information
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Mobile Number">
                <Input value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} placeholder="+91 98765 43210" />
              </Field>
              <Field label="Email Address">
                <Input value={user?.email ?? ""} onChange={() => {}} disabled />
              </Field>
            </div>
          </div>

          {/* Timeline Display Card */}
          <div className="rounded-xl border border-border bg-surface shadow-card p-6 relative overflow-hidden">
            {/* Vertical timeline dotted line */}
            <div className="absolute left-[33px] top-[40px] bottom-[40px] w-px border-l-2 border-dashed border-border/80 z-0" />

            <div className="space-y-12 relative z-10">
              
              {/* Node 1: Company Header */}
              <div className="flex gap-6 items-start">
                <div className="size-10 rounded-full border border-border bg-surface flex items-center justify-center text-primary shadow-sm hover:scale-105 transition-transform">
                  <Building2 className="size-5 text-foreground/80" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-display font-bold uppercase tracking-tight text-foreground">
                      {form.company_name || "Company Name"}
                    </h3>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      <CheckCircle2 className="size-3" /> Active
                    </span>
                  </div>
                  
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>
                      Incorporated on - <span className="font-semibold text-foreground">{form.incorporation_date ? new Date(form.incorporation_date).toLocaleDateString('en-GB') : "—"}</span>
                      <span className="mx-2 text-border">·</span>
                      CIN - <span className="font-semibold text-foreground">{form.cin || "—"}</span>
                    </div>
                    <div className="italic text-foreground/75">(Private Limited Company)</div>
                  </div>
                </div>
              </div>

              {/* Node 2: Addresses */}
              <div className="flex gap-6 items-start">
                <div className="size-10 rounded-full border border-border bg-surface flex items-center justify-center text-primary shadow-sm hover:scale-105 transition-transform">
                  <MapPin className="size-5 text-foreground/80" />
                </div>
                <div className="flex-1 rounded-xl border border-border bg-surface p-5 shadow-sm space-y-6">
                  
                  {/* Postal Address */}
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-success uppercase tracking-wider block">Postal Address</span>
                    <div className="flex justify-between items-start gap-4">
                      {editingPostal ? (
                        <div className="flex-1 flex gap-2 items-start">
                          <textarea
                            value={form.postal_address}
                            onChange={(e) => setForm({ ...form, postal_address: e.target.value })}
                            className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            rows={2}
                          />
                          <button
                            type="button"
                            onClick={() => setEditingPostal(false)}
                            className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            Ok
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-foreground/85 leading-relaxed">
                            {form.postal_address || <span className="text-muted-foreground italic">No postal address set</span>}
                          </p>
                          <button
                            type="button"
                            onClick={() => setEditingPostal(true)}
                            className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors cursor-pointer"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Registered Address */}
                  <div className="space-y-1 border-t border-border pt-4">
                    <span className="text-xs font-semibold text-success uppercase tracking-wider block">Registered Address</span>
                    <div className="flex justify-between items-start gap-4">
                      {editingRegistered ? (
                        <div className="flex-1 flex gap-2 items-start">
                          <textarea
                            value={form.address}
                            onChange={(e) => setForm({ ...form, address: e.target.value })}
                            className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            rows={2}
                          />
                          <button
                            type="button"
                            onClick={() => setEditingRegistered(false)}
                            className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            Ok
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-foreground/85 leading-relaxed">
                            {form.address || <span className="text-muted-foreground italic">No registered address set</span>}
                          </p>
                          <button
                            type="button"
                            onClick={() => setEditingRegistered(true)}
                            className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors cursor-pointer"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                </div>
              </div>

              {/* Node 3: Directors details */}
              <div className="flex gap-6 items-start">
                <div className="size-10 rounded-full border border-border bg-surface flex items-center justify-center text-primary shadow-sm hover:scale-105 transition-transform">
                  <User className="size-5 text-foreground/80" />
                </div>
                <div className="flex-1 space-y-4">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <h3 className="text-lg font-display font-semibold text-foreground">Director Details</h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={syncMca}
                        disabled={syncing || !form.cin}
                        className="inline-flex items-center gap-1.5 text-xs text-primary border border-primary/20 bg-primary/5 hover:bg-primary hover:text-white font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                      >
                        <RotateCw className={`size-3.5 ${syncing ? 'animate-spin' : ''}`} />
                        Update MCA Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setDirectors([...directors, { din: "", name: "", dob: "", fathersName: "", status: "Approved" }])}
                        className="inline-flex items-center gap-1.5 text-xs text-foreground bg-muted hover:bg-muted-foreground/15 font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        <Plus className="size-3.5" /> Add Row
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-surface shadow-card overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm min-w-[600px]">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          <th className="px-4 py-3">DIN</th>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">DOB</th>
                          <th className="px-4 py-3">Father's Name</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-3 py-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {directors.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground italic">
                              No directors listed. Click "Update MCA Details" or "Add Row" to register directors.
                            </td>
                          </tr>
                        ) : (
                          directors.map((d, index) => (
                            <tr key={index} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-2">
                                <input
                                  value={d.din}
                                  onChange={(e) => {
                                    const newD = [...directors];
                                    newD[index].din = e.target.value;
                                    setDirectors(newD);
                                  }}
                                  placeholder="10296098"
                                  className="w-full bg-transparent border-0 focus:ring-0 text-sm focus:border-b focus:border-primary/50 py-0.5 focus:outline-none"
                                />
                              </td>
                              <td className="px-4 py-2 font-medium text-foreground">
                                <input
                                  value={d.name}
                                  onChange={(e) => {
                                    const newD = [...directors];
                                    newD[index].name = e.target.value;
                                    setDirectors(newD);
                                  }}
                                  placeholder="RISHIKA BONAGIRI"
                                  className="w-full bg-transparent border-0 focus:ring-0 text-sm focus:border-b focus:border-primary/50 py-0.5 focus:outline-none"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  value={d.dob}
                                  onChange={(e) => {
                                    const newD = [...directors];
                                    newD[index].dob = e.target.value;
                                    setDirectors(newD);
                                  }}
                                  placeholder="19-01-2001"
                                  className="w-full bg-transparent border-0 focus:ring-0 text-sm focus:border-b focus:border-primary/50 py-0.5 focus:outline-none"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  value={d.fathersName}
                                  onChange={(e) => {
                                    const newD = [...directors];
                                    newD[index].fathersName = e.target.value;
                                    setDirectors(newD);
                                  }}
                                  placeholder="RAMAKRISHNA BONAGIRI"
                                  className="w-full bg-transparent border-0 focus:ring-0 text-sm focus:border-b focus:border-primary/50 py-0.5 focus:outline-none"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <select
                                  value={d.status}
                                  onChange={(e) => {
                                    const newD = [...directors];
                                    newD[index].status = e.target.value;
                                    setDirectors(newD);
                                  }}
                                  className="bg-transparent border-0 text-xs text-success-foreground font-semibold uppercase tracking-wider py-0.5 focus:outline-none focus:ring-0 cursor-pointer"
                                >
                                  <option value="Approved">Approved</option>
                                  <option value="Pending">Pending</option>
                                  <option value="Disqualified">Disqualified</option>
                                </select>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => setDirectors(directors.filter((_, idx) => idx !== index))}
                                  className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      ) : (
        /* ================== INDIVIDUAL PROFILE FORM ================== */
        <div className="space-y-6">
          {/* Section 1: Basic Details */}
          <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
            <h3 className="text-sm font-semibold border-b border-border pb-2 text-foreground/90">Basic Details</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Full Name">
                <Input value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} placeholder="Rahul Sharma" />
              </Field>
              <Field label="Mobile Number">
                <Input value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} placeholder="+91 98765 43210" />
              </Field>
              <Field label="Email Address">
                <Input value={user?.email ?? ""} onChange={() => {}} disabled />
              </Field>
            </div>
            <Field label="Address">
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={2}
                placeholder="House / street, area, city, state, PIN"
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </Field>
          </div>

          {/* Section 2: Identification Details */}
          <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
            <h3 className="text-sm font-semibold border-b border-border pb-2 text-foreground/90">Identification Details</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="PAN Card Number">
                <Input value={form.pan} onChange={(v) => setForm({ ...form, pan: v.toUpperCase() })} placeholder="ABCDE1234F" />
              </Field>
              <Field label="Aadhaar Number">
                <Input value={form.aadhaar} onChange={(v) => setForm({ ...form, aadhaar: v.replace(/\D/g, "") })} placeholder="12-digit Aadhaar" />
              </Field>
              <Field label="Passport Number">
                <Input value={form.passport} onChange={(v) => setForm({ ...form, passport: v.toUpperCase() })} placeholder="Passport Number" />
              </Field>
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div
          className={
            "text-[12px] rounded-md px-3 py-2 border " +
            (msg.type === "err"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-primary/25 bg-primary/8 text-primary")
          }
        >
          {msg.text}
        </div>
      )}

      {/* Submit Button */}
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={save.isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand disabled:opacity-60 cursor-pointer"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save Profile Details
        </button>
        {saved && (
          <span className="text-[12px] text-success flex items-center gap-1">
            <CheckCircle2 className="size-3.5" /> Profile successfully updated
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

function Input({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
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
