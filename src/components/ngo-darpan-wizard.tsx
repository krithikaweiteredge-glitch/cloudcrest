import { useMemo, useState, useEffect } from "react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { useAuth } from "@/hooks/use-auth";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useCatalogService, resolveFees } from "@/lib/service-catalog";
import { ServiceDetailPage } from "@/components/service-detail-page";
import {
  AlertTriangle, Download, ArrowLeft, ArrowRight,
  FileText, Info, ShieldCheck, Zap, Send, Lock, Users,
} from "lucide-react";

/**
 * NGO Darpan (NITI Aayog) registration wizard.
 *
 * Mirrors the MSME wizard: the tabbed service page stays as the landing view and
 * "Start Application" swaps it for this stepper. Steps follow the four cards of
 * "Updated Darpaan.html" in order, plus the Fees / Summary pair every wizard has:
 *   1 Profile & Operations · 2 Bank Details · 3 Governing Body
 *
 * The HTML collects member PAN/Aadhaar and the entity documents as <input
 * type="file"> inline. This app uploads after submission instead — RegisterDialog
 * turns the `documents` checklist into one upload control per entry. The wizard
 * never renders that checklist itself, as a step or beside one: the applicant
 * sees it where the files actually go.
 */
const STEPS = [
  { key: "profile", label: "Profile" },
  { key: "bank", label: "Bank" },
  { key: "governing", label: "Governing Body" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

/**
 * Entity type → what its governing body is called and the designations open to
 * it. Copied from `entityDesignations` in the source HTML, which maps the NGO
 * Darpan portal's own options.
 */
const ENTITY_DESIGNATIONS: Record<string, { title: string; options: string[] }> = {
  "Registered Societies (Non-Government)": {
    title: "Office Bearer",
    options: ["President", "Vice-President", "Secretary", "Joint Secretary", "Treasurer", "Executive Member"],
  },
  "Trust (Non-Government)": {
    title: "Trustee",
    options: ["Managing Trustee", "Trustee", "Chairman", "Secretary", "Treasurer"],
  },
  "Private Sector Companies (Sec 8/25)": {
    title: "Director",
    options: ["Director", "Managing Director", "Chairman"],
  },
  "Cooperative Society": {
    title: "Board Member",
    options: ["Chairman", "Vice Chairman", "Secretary", "Board Member"],
  },
  "Academic Institutions (Private)": {
    title: "Governing Member",
    options: ["Chairman", "Director", "Principal", "Trustee", "Member"],
  },
  "Other Registered Entities (Non-Government)": {
    title: "Governing Member",
    options: ["President", "Secretary", "Treasurer", "Member"],
  },
};

const ENTITY_TYPES = Object.keys(ENTITY_DESIGNATIONS);

const SECTORS = ["Agriculture", "Education & Literacy", "Health & Family Welfare", "Any Other"];

/** Governing document expected per entity type — named on the checklist. */
const GOVERNING_DOC: Record<string, string> = {
  "Registered Societies (Non-Government)": "Governing document — Memorandum of Association (MOA) & bye-laws",
  "Trust (Non-Government)": "Governing document — Trust Deed",
  "Private Sector Companies (Sec 8/25)": "Governing document — MOA & AOA",
  "Cooperative Society": "Governing document — bye-laws",
  "Academic Institutions (Private)": "Governing document — MOA / Trust Deed",
  "Other Registered Entities (Non-Government)": "Governing document — MOA / Trust Deed",
};

const ENTITY_DOCS = ["NGO PAN card", "Registration certificate (RC / COI)"];
const BANK_DOC = "Cancelled cheque / first page of bank statement";

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "NITI Aayog Portal Filing" },
  { icon: Zap, label: "Entity-wise Designations" },
];

// NGO Darpan carries no government fee — NITI Aayog doesn't charge for a Darpan
// ID, so this is the professional fee plus GST. Overridden by admin pricing on
// the `ngo-darpan` catalog row.
const FEE_FALLBACK = { professional: 1999, govt: 0, gstPercent: 18 };

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const MAX_MEMBERS = 10;
const DESC_LIMIT = 500;

type Member = { designation: string; mobile: string; email: string };

const emptyMember = (): Member => ({ designation: "", mobile: "", email: "" });

function format10DigitPhone(phoneStr?: string | null): string {
  if (!phoneStr) return "";
  let cleaned = phoneStr.trim();
  if (cleaned.startsWith("+91")) cleaned = cleaned.slice(3);
  else if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(2);
  cleaned = cleaned.replace(/\D/g, "");
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
}

/**
 * NGO Darpan module entry point. Service page first, stepper behind
 * "Start Application" — same shape as MsmeModule.
 */
export function NgoDarpanModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <NgoDarpanWizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug="ngo-darpan" onStartApplication={() => setApplying(true)} />;
}

export function NgoDarpanWizard({ initialName, onBack: onExit }: { initialName?: string; onBack?: () => void }) {
  const { user } = useAuth();

  const [step, setStep] = useState(0);

  // Step 1 — Profile & operations.
  const [ngoName, setNgoName] = useState(initialName || "");
  const [entityType, setEntityType] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [sector, setSector] = useState("");
  const [activities, setActivities] = useState("");

  // Step 2 — Bank details. No default: the HTML leaves both radios unchecked.
  const [bankMode, setBankMode] = useState<"upload" | "manual" | "">("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");

  // Step 3 — Governing body.
  const [members, setMembers] = useState<Member[]>([]);

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setAuthEmail((prev) => prev || user.email || "");
    setAuthPhone((prev) => prev || format10DigitPhone(user.phone));

    fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/profiles/me`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setAuthEmail((prev) => prev || data.user.email || user.email || "");
          setAuthPhone((prev) => prev || format10DigitPhone(data.user.phone || user.phone));
        }
      })
      .catch((err) => console.error("Error prefilling wizard profile:", err));
  }, [user]);

  const stepKey = STEPS[step]?.key;

  const entityConfig = ENTITY_DESIGNATIONS[entityType] ?? { title: "Governing Member", options: ["Member"] };

  const { service, loading: catalogLoading } = useCatalogService(["ngo-darpan"]);
  const fees = resolveFees(service, "NITI Aayog", FEE_FALLBACK);
  const total = fees.total;

  const professionalFee =
    (fees.lines.find((l) => /professional/i.test(l.label))?.amount || 0) || FEE_FALLBACK.professional;
  const gstAmount = fees.lines.find((l) => /gst/i.test(l.label))?.amount ?? 0;

  /**
   * Upload checklist. Entity documents + the governing document named for this
   * entity type, a bank proof when the applicant chose to upload rather than
   * type, and a PAN + Aadhaar pair per governing-body member — the HTML asks for
   * both against every member.
   */
  const documents = useMemo(() => {
    const list = [...ENTITY_DOCS];
    if (entityType) list.push(GOVERNING_DOC[entityType]);
    if (bankMode === "upload") list.push(BANK_DOC);
    members.forEach((m, i) => {
      const who = `${entityConfig.title} ${i + 1}${m.designation ? ` (${m.designation})` : ""}`;
      list.push(`${who} — PAN`, `${who} — Aadhaar`);
    });
    return list;
  }, [entityType, bankMode, members, entityConfig.title]);

  /** Resize the member list, preserving what's already typed. */
  const setMemberCount = (n: number) => {
    setMembers((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push(emptyMember());
      return next;
    });
  };

  const updateMember = (i: number, patch: Partial<Member>) => {
    setMembers((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  };

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    const fail = (field: string, msg: string) => {
      newErrors[field] = msg;
      if (!globalMsg) globalMsg = msg;
    };

    if (currentStep === 0) {
      if (!ngoName.trim()) fail("ngoName", "Please enter the name of the NGO / entity.");
      if (!entityType) fail("entityType", "Please select an entity type.");
      if (!/^\S+@\S+\.\S+$/.test(authEmail.trim())) fail("authEmail", "Enter a valid authorised email ID.");
      if (!/^[6-9]\d{9}$/.test(authPhone.trim())) fail("authPhone", "Enter a valid 10-digit mobile number — the portal sends an OTP to it.");
      if (!sector) fail("sector", "Please select the primary sector.");
      if (!activities.trim()) fail("activities", "Please describe the core activities.");
      else if (activities.trim().length > DESC_LIMIT) fail("activities", `Keep the description under ${DESC_LIMIT} characters.`);
    } else if (currentStep === 1) {
      if (!bankMode) fail("bankMode", "Please choose how you'll provide bank details.");
      if (bankMode === "manual") {
        if (!accountNumber.trim()) fail("accountNumber", "Account number is required.");
        if (!ifsc.trim()) fail("ifsc", "IFSC code is required.");
        else if (!IFSC_RE.test(ifsc.trim().toUpperCase())) fail("ifsc", "Enter a valid 11-character IFSC (e.g. HDFC0001234).");
      }
    } else if (currentStep === 2) {
      if (members.length < 1) fail("memberCount", "Select how many governing body members to add.");
      members.forEach((m, i) => {
        const n = i + 1;
        if (!m.designation) fail(`member-${i}-designation`, `${entityConfig.title} ${n}: select a designation.`);
        if (!/^[6-9]\d{9}$/.test(m.mobile.trim())) fail(`member-${i}-mobile`, `${entityConfig.title} ${n}: enter a valid 10-digit mobile number.`);
        if (!/^\S+@\S+\.\S+$/.test(m.email.trim())) fail(`member-${i}-email`, `${entityConfig.title} ${n}: enter a valid email ID.`);
      });
    }

    setErrors(newErrors);
    setStepError(globalMsg);
    return Object.keys(newErrors).length === 0 && !globalMsg;
  };

  const next = () => {
    if (!user) {
      setOpenSignIn(true);
      return;
    }
    if (validateStep(step)) {
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
      setStepError(null);
      setErrors({});
    }
  };

  const back = () => {
    setStep((s) => Math.max(0, s - 1));
    setStepError(null);
    setErrors({});
  };

  const downloadSummaryPdf = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/summary/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "NGO Darpan Registration",
          name1: ngoName,
          form: "NGO Darpan",
          objects: activities,
          directors: members.length,
          fees: fees.lines,
          total,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate PDF summary");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `NGO_Darpan_Summary_${ngoName ? ngoName.trim().replace(/\s+/g, "_") : "NGO"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      alert(err.message || "Failed to download PDF summary");
    }
  };

  return (
    <div>
      {/* Hero band */}
      <section className="relative overflow-hidden gradient-hero text-white">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, oklch(0.7 0.19 45 / 0.4), transparent 40%), radial-gradient(circle at 80% 80%, oklch(0.6 0.18 240 / 0.5), transparent 45%)",
          }}
        />
        <div className="hero-grid" />
        <div className="relative px-10 py-10 max-w-5xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[11px] mono uppercase tracking-widest text-white/90">
            <span className="size-1.5 rounded-full bg-primary live-dot" />
            NITI Aayog · NGO Darpan Portal
          </span>
          <h1 className="mt-4 text-4xl md:text-[42px] font-semibold font-display tracking-tight leading-[1.05]">
            NGO Darpan Registration
          </h1>
          <p className="mt-3 text-white/70 max-w-2xl text-[15px] leading-relaxed">
            Guided Cloudcrest BM workspace for NITI Aayog's NGO Darpan — entity profile,
            governing body details, bank particulars and document collection, through to
            your Unique ID.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {HIGHLIGHTS.map((h) => (
              <span
                key={h.label}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/12 border border-white/15 text-[12px] text-white/90 hover:bg-white/20 transition-colors"
              >
                <h.icon className="size-3.5 text-primary" />
                {h.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="flex">
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-10 py-8 animate-in-up">
            {onExit && (
              <button
                onClick={onExit}
                className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <ArrowLeft className="size-3.5" /> Back to NGO Darpan service details
              </button>
            )}

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">NGO Darpan · NITI Aayog</div>
              <h2 className="text-2xl font-semibold tracking-tight">NGO Darpan Registration Wizard</h2>
            </div>

            <div className="rounded-xl border border-border bg-surface shadow-card p-4">
              <Stepper
                steps={STEPS}
                current={step}
                onGo={(s) => (s > step && !user ? setOpenSignIn(true) : setStep(s))}
              />
            </div>

            {stepError && (
              <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 flex items-center gap-2.5 text-xs text-destructive animate-in fade-in-50">
                <AlertTriangle className="size-4 shrink-0" />
                <span className="font-semibold">{stepError}</span>
              </div>
            )}

            <div className="mt-6 rounded-xl border border-warning/25 bg-warning/8 p-4 flex gap-3">
              <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
              <div className="text-xs text-foreground/80">
                <span className="font-semibold text-foreground">OTP verification · </span>
                NITI Aayog sends a one-time password to the authorised email and mobile below — use
                contacts you can access during filing.
              </div>
            </div>

            <div key={step} className="mt-8 animate-in-up">
              {/* STEP 1 — PROFILE & OPERATIONS */}
              {stepKey === "profile" && (
                <Section
                  title="NGO Profile & Operations"
                  desc="The entity's registered identity and the work it does, as it will appear on the Darpan record."
                >
                  <Field label="Name of NGO / Entity *" error={errors.ngoName}>
                    <Input value={ngoName} onChange={setNgoName} placeholder="e.g. Sunrise Welfare Foundation" error={errors.ngoName} />
                  </Field>

                  <Field label="Entity Type *" error={errors.entityType}>
                    <Select
                      value={entityType}
                      onChange={(v) => {
                        setEntityType(v);
                        // Designations differ per entity type, so any already
                        // chosen become invalid — clear them, keep contacts.
                        setMembers((prev) => prev.map((m) => ({ ...m, designation: "" })));
                      }}
                      error={errors.entityType}
                    >
                      <option value="">— Select type —</option>
                      {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Authorised Email ID *" error={errors.authEmail}>
                      <Input value={authEmail} onChange={setAuthEmail} placeholder="contact@ngo.org" error={errors.authEmail} />
                    </Field>
                    <Field label="Authorised Mobile Number *" error={errors.authPhone}>
                      <Input
                        value={authPhone}
                        onChange={(v) => setAuthPhone(v.replace(/[^\d]/g, "").slice(0, 10))}
                        placeholder="10-digit number for OTP"
                        error={errors.authPhone}
                      />
                    </Field>
                  </div>

                  <Field label="Sector Working In (primary) *" error={errors.sector}>
                    <Select value={sector} onChange={setSector} error={errors.sector}>
                      <option value="">— Select sector —</option>
                      {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </Field>

                  <Field label="Brief Description of Core Activities *" error={errors.activities}>
                    <TextArea
                      value={activities}
                      onChange={setActivities}
                      rows={4}
                      placeholder="Briefly describe the NGO's main work and objectives"
                      error={errors.activities}
                    />
                    <div className={"text-[11px] mt-1 " + (activities.length > DESC_LIMIT ? "text-destructive font-medium" : "text-muted-foreground")}>
                      {activities.length} / {DESC_LIMIT} characters
                    </div>
                  </Field>
                </Section>
              )}

              {/* STEP 2 — BANK DETAILS */}
              {stepKey === "bank" && (
                <Section
                  title="Bank Details"
                  desc="How would you like to provide your bank details?"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <OptionCard
                      active={bankMode === "upload"}
                      onClick={() => { setBankMode("upload"); setErrors({}); setStepError(null); }}
                      title="Upload proof"
                      subtitle="Cancelled cheque or first page of your bank statement — collected with your documents."
                    />
                    <OptionCard
                      active={bankMode === "manual"}
                      onClick={() => { setBankMode("manual"); setErrors({}); setStepError(null); }}
                      title="Enter manually"
                      subtitle="Type the account number and IFSC code now."
                    />
                  </div>
                  {errors.bankMode && <ErrText>{errors.bankMode}</ErrText>}

                  {bankMode === "manual" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Account Number *" error={errors.accountNumber}>
                        <Input
                          value={accountNumber}
                          onChange={(v) => setAccountNumber(v.replace(/[^\d]/g, ""))}
                          placeholder="Enter account number"
                          error={errors.accountNumber}
                        />
                      </Field>
                      <Field label="IFSC Code *" error={errors.ifsc}>
                        <Input
                          value={ifsc}
                          onChange={(v) => setIfsc(v.toUpperCase().slice(0, 11))}
                          placeholder="11-character code"
                          error={errors.ifsc}
                        />
                      </Field>
                    </div>
                  )}

                  {bankMode === "upload" && (
                    <div className="rounded-lg border border-border bg-panel p-3.5 flex gap-2">
                      <FileText className="size-3.5 text-primary shrink-0 mt-0.5" />
                      <div className="text-[11px] text-foreground/70 leading-relaxed">
                        “{BANK_DOC}” has been added to your document checklist. You'll upload it after submitting.
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* STEP 3 — GOVERNING BODY */}
              {stepKey === "governing" && (
                <Section
                  title="Governing Body Details"
                  desc={
                    entityType
                      ? `Designations below are those available to a ${entityType.replace(/\s*\(.*\)$/, "")}.`
                      : "Select an entity type in step 1 to load the correct designations."
                  }
                >
                  <Field label="Number of Governing Body Members *" error={errors.memberCount}>
                    <Select
                      value={String(members.length)}
                      onChange={(v) => setMemberCount(Number(v))}
                      error={errors.memberCount}
                    >
                      <option value="0">— Select number of members —</option>
                      {Array.from({ length: MAX_MEMBERS }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={String(n)}>{n}</option>
                      ))}
                    </Select>
                  </Field>

                  {members.length === 0 && (
                    <div className="rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
                      <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
                      <div className="text-[11px] text-foreground/70 leading-relaxed">
                        Each member adds a PAN and an Aadhaar to your upload checklist.
                      </div>
                    </div>
                  )}

                  {members.map((m, i) => (
                    <div key={i} className="rounded-lg border border-border bg-panel p-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <Users className="size-3.5 text-primary" />
                        <h4 className="text-sm font-semibold">{entityConfig.title} {i + 1}</h4>
                      </div>

                      <Field label="Designation *" error={errors[`member-${i}-designation`]}>
                        <Select
                          value={m.designation}
                          onChange={(v) => updateMember(i, { designation: v })}
                          error={errors[`member-${i}-designation`]}
                        >
                          <option value="">— Select designation —</option>
                          {entityConfig.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </Select>
                      </Field>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Mobile Number *" error={errors[`member-${i}-mobile`]}>
                          <Input
                            value={m.mobile}
                            onChange={(v) => updateMember(i, { mobile: v.replace(/[^\d]/g, "").slice(0, 10) })}
                            placeholder="Enter mobile number"
                            error={errors[`member-${i}-mobile`]}
                          />
                        </Field>
                        <Field label="Email ID *" error={errors[`member-${i}-email`]}>
                          <Input
                            value={m.email}
                            onChange={(v) => updateMember(i, { email: v })}
                            placeholder="Enter email ID"
                            error={errors[`member-${i}-email`]}
                          />
                        </Field>
                      </div>

                      <div className="text-[11px] text-muted-foreground">
                        PAN and Aadhaar for this member are collected in your upload checklist.
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {/* STEP 4 — FEES */}
              {stepKey === "fees" && (
                !user ? (
                  <div className="rounded-xl border border-border bg-surface shadow-card p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Lock className="size-4 text-primary" />
                      <h3 className="text-sm font-semibold">Sign in to view fees</h3>
                    </div>
                    <p className="text-[13px] text-muted-foreground max-w-[60ch]">
                      Fee estimates are available to signed-in customers. Sign in to see the
                      breakdown, download the summary and submit your application.
                    </p>
                    <button
                      onClick={() => setOpenSignIn(true)}
                      className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all"
                    >
                      Sign in to continue <ArrowRight className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="size-4 text-primary" />
                      <h3 className="text-sm font-semibold">Estimated NGO Darpan Fee Breakdown</h3>
                    </div>
                    {catalogLoading ? (
                      <div className="text-xs text-muted-foreground py-4">Loading current pricing…</div>
                    ) : total > 0 ? (
                      <div className="space-y-2 text-xs">
                        {fees.lines.map((line) => (
                          <div key={line.label} className="flex justify-between">
                            <span className="text-muted-foreground">{line.label}</span>
                            <span className="mono">₹ {line.amount.toLocaleString("en-IN")}</span>
                          </div>
                        ))}
                        <div className="pt-3 border-t border-border flex justify-between items-baseline font-bold text-sm">
                          <span>Total Estimated Cost</span>
                          <span className="mono text-primary text-xl">₹ {total.toLocaleString("en-IN")}</span>
                        </div>
                      </div>
                    ) : (
                      // The catalog row has no price set — say so rather than quoting ₹0.
                      <div className="text-[13px] text-muted-foreground">
                        Pricing for NGO Darpan isn't published yet. Your Cloudcrest BM advisor will
                        confirm the fee before any payment — you can still submit the application now.
                      </div>
                    )}
                  </div>
                )
              )}

              {/* STEP 6 — SUMMARY */}
              {stepKey === "summary" && (
                <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary">
                      NGO Darpan Application Preview
                    </div>
                    <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning font-semibold">
                      READY TO SUBMIT
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">NGO / Entity</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{ngoName || "—"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Entity Type</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{entityType || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Authorised Email</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{authEmail || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Authorised Mobile</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">{authPhone || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Primary Sector</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{sector || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Bank Details</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {bankMode === "manual"
                          ? `A/c ending ${accountNumber.slice(-4) || "—"} · ${ifsc.toUpperCase()}`
                          : bankMode === "upload"
                            ? "Proof to be uploaded"
                            : "—"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">{entityConfig.title}s</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {members.length === 0
                          ? "—"
                          : members.map((m, i) => `${i + 1}. ${m.designation || "—"}`).join("  ·  ")}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Core Activities</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{activities || "—"}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Actions */}
              <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
                <button
                  onClick={back}
                  disabled={step === 0}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-all cursor-pointer"
                >
                  <ArrowLeft className="size-3.5" /> Back
                </button>
                <div className="flex items-center gap-4">
                  {step === STEPS.length - 1 ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={downloadSummaryPdf}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Download className="size-4" /> Summary
                      </button>
                      <button
                        onClick={() => setOpenReg(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
                      >
                        <Send className="size-4" /> Submit Application
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={next}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
                    >
                      Next · {STEPS[step + 1].label}
                      <ArrowRight className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <aside className="hidden lg:block w-80 border-l border-border bg-surface">
          <div className="sticky top-16 p-6">
            <div className="label-eyebrow mb-2.5 text-primary">Current Selection</div>
            <div className="rounded-lg border border-border bg-panel p-3.5 space-y-3">
              <div>
                <div className="text-[11px] text-muted-foreground font-medium">Entity Type</div>
                <div className="text-sm font-semibold text-foreground mt-0.5">{entityType || "Not selected"}</div>
              </div>
              <div className="pt-2.5 border-t border-border/60">
                <div className="text-[11px] text-muted-foreground font-medium">Professional Fee</div>
                <div className="text-xs font-semibold mono text-primary mt-0.5">
                  ₹{professionalFee.toLocaleString("en-IN")} + 18% GST
                </div>
              </div>
            </div>

            {/* No document checklist here: it belongs in the upload panel at
                submit, where the slots actually are, rather than as read-only
                text beside every step. Same convention as the DIN / IEC / LEI /
                RERA wizards. */}
          </div>
        </aside>
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="ngo-darpan"
        serviceTitle="NGO Darpan Registration"
        authority="NITI Aayog"
        initialEmail={authEmail}
        initialPhone={authPhone}
        formData={{
          ngoName,
          entityType,
          authorisedEmail: authEmail,
          authorisedPhone: authPhone,
          sector,
          activities,
          bankMode,
          ...(bankMode === "manual" ? { accountNumber, ifsc: ifsc.toUpperCase() } : {}),
          governingBodyTitle: entityConfig.title,
          governingBodyCount: members.length,
          governingBody: members.map((m, i) => ({
            index: i + 1,
            designation: m.designation,
            mobile: m.mobile,
            email: m.email,
          })),
        }}
        documents={documents}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your NGO Darpan registration — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/ngo-darpan"
      />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface shadow-card p-6">{children}</div>;
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </div>
        {children}
      </div>
    </Card>
  );
}

function ErrText({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-destructive font-medium mt-1.5">{children}</p>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground/90 block">{label}</label>
      {children}
      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
    </div>
  );
}

function OptionCard({
  active, onClick, title, subtitle,
}: { active: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-left p-3.5 rounded-lg border transition-all hover-lift ring-focus " +
        (active
          ? "border-primary ring-2 ring-primary/25 bg-primary/[0.04]"
          : "border-border hover:border-border-strong bg-surface")
      }
    >
      <div className="flex items-center gap-2">
        <span
          className={
            "size-3.5 rounded-full border-2 grid place-items-center shrink-0 " +
            (active ? "border-primary" : "border-border-strong")
          }
        >
          {active && <span className="size-1.5 rounded-full bg-primary" />}
        </span>
        <span className="text-sm font-semibold leading-tight">{title}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1.5 pl-[22px]">{subtitle}</div>
    </button>
  );
}

const fieldClass = (error?: string) =>
  "w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " +
  (error ? "border-destructive focus:ring-destructive/25" : "border-border");

function Input({ value, onChange, placeholder, error }: { value: string; onChange: (v: string) => void; placeholder?: string; error?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={fieldClass(error)}
    />
  );
}

function TextArea({ value, onChange, placeholder, error, rows = 2 }: { value: string; onChange: (v: string) => void; placeholder?: string; error?: string; rows?: number }) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={fieldClass(error)}
    />
  );
}

function Select({ value, onChange, error, children }: { value: string; onChange: (v: string) => void; error?: string; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass(error)}>
      {children}
    </select>
  );
}
