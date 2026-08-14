import { useMemo, useState, useEffect } from "react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { useAuth } from "@/hooks/use-auth";
import { SignInDialog } from "@/components/sign-in-dialog";
import { INDIAN_STATES } from "@/lib/form-options";
import { useFeeEstimate, type FeeContext } from "@/lib/fees-api";
import { useCatalogFamily } from "@/lib/service-catalog";
import { resolveWizardRules } from "@/lib/company-types";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Info, ShieldCheck, Zap,
  ClipboardList, FileDown, Send, Plus, Minus, Loader2, TrendingUp,
  User, Sprout, Globe, Wheat, Landmark, Handshake, Lock,
} from "lucide-react";

const BACKEND = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

// ─── Company types (from the incorporation-wizard spec) ───
type CompanyType = {
  value: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  /** Catalog slug used for per-type pricing/documents when one exists. */
  slug: string;
  /** Backend fee-engine entity key + liability, so fees come from the server. */
  entity: string;
  liability?: "shares" | "guarantee";
  entityClass?: "private" | "public";
  /**
   * Default legal name suffix for the type. A "/"-separated value is a choice the
   * applicant picks. Overridden by the catalog variant's `wizardRules.suffix`
   * when the admin has configured one.
   */
  suffix: string;
};
const COMPANY_TYPES: CompanyType[] = [
  { value: "Private Limited Company", short: "Private Limited", icon: ShieldCheck, desc: "Most popular. Min 2 directors, up to 200 shareholders. Limited liability.", slug: "company-pvt", entity: "pvt", entityClass: "private", suffix: "Private Limited" },
  { value: "Public Limited Company", short: "Public Limited", icon: TrendingUp, desc: "Raise funds publicly. Min 3 directors, 7 shareholders.", slug: "company-public", entity: "public", entityClass: "public", suffix: "Limited" },
  { value: "One Person Company (OPC)", short: "OPC", icon: User, desc: "Solo founder with limited liability. Indian resident only.", slug: "company-opc", entity: "opc", suffix: "(OPC) Private Limited" },
  { value: "Section 8 Company (Non-Profit)", short: "Section 8", icon: Sprout, desc: "Charitable/educational. No dividends to members.", slug: "company-sec8", entity: "sec8", suffix: "Foundation / Association / Council / Sangh / Federation" },
  { value: "Foreign Company", short: "Foreign", icon: Globe, desc: "Foreign entity establishing a place of business in India.", slug: "company", entity: "foreign", suffix: "Limited" },
  { value: "Producer Company", short: "Producer", icon: Wheat, desc: "For farmers & primary producers. Min 10 members or 2 institutions.", slug: "company-producer", entity: "producer", suffix: "Producer Company Limited" },
  { value: "Nidhi Company", short: "Nidhi", icon: Landmark, desc: "Mutual benefit — borrowing and lending among members only.", slug: "company-nidhi", entity: "nidhi", suffix: "Nidhi Limited" },
  { value: "Company Limited by Guarantee", short: "By Guarantee", icon: Handshake, desc: "No share capital. Liability limited by guarantee amount.", slug: "company-guarantee", entity: "pvt", liability: "guarantee", suffix: "Private Limited / Limited" },
];

const INDUSTRY_OPTIONS = [
  "IT & Software", "Manufacturing", "Trading", "Professional Services", "Healthcare",
  "Education", "Real Estate", "E-commerce", "Finance / NBFC", "Agriculture", "Food & Beverages",
];

const AUTH_CAP_PRESETS: { label: string; value: number }[] = [
  { label: "₹1 Lakh", value: 100000 },
  { label: "₹5 Lakh", value: 500000 },
  { label: "₹10 Lakh", value: 1000000 },
  { label: "₹25 Lakh", value: 2500000 },
  { label: "₹50 Lakh", value: 5000000 },
  { label: "₹1 Crore", value: 10000000 },
];

const STEPS = [
  { key: "type", label: "Type" },
  { key: "name", label: "Name" },
  { key: "details", label: "Details" },
  { key: "capital", label: "Capital" },
  { key: "fees", label: "Fees" },
  { key: "docs", label: "Docs" },
  { key: "summary", label: "Summary" },
];

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Real Validations" },
  { icon: Zap, label: "Dynamic Fee Estimate" },
  { icon: ClipboardList, label: "Document Checklist" },
  { icon: FileDown, label: "Downloadable Summary" },
];

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

// ─── Type-specific document checklist (mirrors the spec) ───
type DocSection = { title: string; tone: "primary" | "success"; docs: string[] };
function buildDocs(type: string): DocSection[] {
  const t = type;
  return [
    {
      title: "Identity & Address Documents (per Director / Shareholder)",
      tone: "primary",
      docs: [
        "PAN Card — self-attested copy (mandatory for every Director and Shareholder)",
        "Aadhaar Card / Voter ID / Passport — any one (identity proof)",
        "Electricity Bill / Bank Statement not older than 2 months (address proof)",
        "Passport-size photographs — 2 copies per person",
        "Specimen signature on plain white paper",
      ],
    },
    {
      title: "Registered Office Proof",
      tone: "primary",
      docs: [
        "Electricity Bill or Property Tax Receipt (not older than 2 months)",
        "NOC from property owner — if premises is rented",
        "Rent Agreement / Lease Deed — if rented",
        "Sale Deed / Own property document — if owned by a director",
      ],
    },
    {
      title: "Company Formation & MCA Filing Documents",
      tone: "primary",
      docs: [
        ...(t.includes("Section 8") ? [] : ["INC-9 — Declaration by subscribers and first directors"]),
        "Memorandum of Association (MoA) — drafted by Cloudcrest BM CS team",
        "Articles of Association (AoA) — internal rules and regulations",
        "SPICe+ Form (Part A & Part B) — filed on MCA21 portal",
        "DIR-2 — Consent to act as Director from each proposed director",
        "Digital Signature Certificates (DSC) for all signing directors",
        ...(t.includes("Public") ? ["Form ADT-1 — Statutory Auditor Appointment", "Minimum 7 subscribers must sign the MoA"] : []),
        ...(t.includes("Section 8") ? ["Form INC-12 — Section 8 Licence (Central Govt approval)", "Estimated income & expenditure statement for 3 years"] : []),
        ...(t.includes("Foreign") ? ["Certified copy of Charter/Incorporation docs of Foreign Company (apostilled)", "Form FC-1 within 30 days of establishing business in India"] : []),
        ...(t.includes("Nidhi") ? ["Minimum 200 members within 1 year of incorporation", "Net Owned Funds ≥ ₹10 Lakh", "NDH-1 Annual Return filing"] : []),
      ],
    },
    ...(t.includes("OPC")
      ? [{
          title: "Additional — One Person Company",
          tone: "primary" as const,
          docs: [
            "Form INC-3 — Nominee's written consent",
            "Declaration: sole member is Indian citizen, 182+ days India resident",
            "Nominee's PAN, Aadhaar, and address proof",
          ],
        }]
      : []),
    {
      title: "Post-Incorporation Steps (30–180 days)",
      tone: "success",
      docs: [
        "Open Current Bank Account in company name",
        "PAN & TAN (auto-generated via SPICe+)",
        "GST Registration if turnover expected to exceed ₹20–40 lakh",
        "INC-20A — Commencement of Business (within 180 days)",
        "Professional Tax Registration (state-specific)",
        "Appointment of Statutory Auditor within 30 days",
      ],
    },
  ];
}

function format10DigitPhone(phoneStr?: string | null): string {
  if (!phoneStr) return "";
  let c = phoneStr.trim();
  if (c.startsWith("+91")) c = c.slice(3);
  else if (c.startsWith("91") && c.length > 10) c = c.slice(2);
  c = c.replace(/\D/g, "");
  return c.length > 10 ? c.slice(-10) : c;
}

type NameStatus = null | { state: "checking" } | { state: "done"; ok: boolean; msg: string };

export function CompanyWizard({ initialName }: { initialName?: string }) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Step 1
  const [typeValue, setTypeValue] = useState("");
  // Step 2
  const [names, setNames] = useState<string[]>([initialName || "", "", ""]);
  const [nameStatus, setNameStatus] = useState<NameStatus[]>([null, null, null]);
  // Step 3
  const [mainObjects, setMainObjects] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [numDir, setNumDir] = useState<number | "">("");
  const [numShar, setNumShar] = useState<number | "">("");
  const [sameDirShar, setSameDirShar] = useState(true);
  const [extraShar, setExtraShar] = useState<number | "">("");
  const [dins, setDins] = useState<{ din: string; name: string }[]>([{ din: "", name: "" }]);
  const [state, setState] = useState("Telangana");
  const [city, setCity] = useState("");
  const [pin, setPin] = useState("");
  const [addr, setAddr] = useState("");
  // Step 4
  const [authCapSel, setAuthCapSel] = useState<string>("");
  const [authCapCustom, setAuthCapCustom] = useState<number | "">("");
  const [paidCap, setPaidCap] = useState<number | "">("");
  // contact
  const [applicantEmail, setApplicantEmail] = useState("");
  const [applicantPhone, setApplicantPhone] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);
  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  // The picked legal ending when the type offers a choice (e.g. Section 8).
  const [suffixChoice, setSuffixChoice] = useState("");

  useEffect(() => {
    if (!user) return;
    setApplicantEmail((p) => p || user.email || "");
    setApplicantPhone((p) => p || format10DigitPhone(user.phone));
    fetch(`${BACKEND}/api/profiles/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) {
          setApplicantEmail((p) => p || d.user.email || user.email || "");
          setApplicantPhone((p) => p || format10DigitPhone(d.user.phone || user.phone));
        }
      })
      .catch(() => {});
  }, [user]);

  const selectedType = COMPANY_TYPES.find((t) => t.value === typeValue) ?? null;
  const authCap = authCapSel === "custom" ? Number(authCapCustom || 0) : Number(authCapSel || 0);
  const dirCount = Number(numDir || 0);
  const isGuarantee = selectedType?.liability === "guarantee";

  // Fees come from the backend engine (backend/src/config/statutoryFees.ts) — the
  // single source of truth, recomputed authoritatively at submission. The wizard
  // only describes the incorporation with a FeeContext; it does NOT compute fees
  // itself. The endpoint is auth-gated (the breakdown includes the professional
  // fee), so the estimate is only fetched once signed in.
  const feeContext: FeeContext = {
    kind: "company",
    entity: selectedType?.entity ?? "pvt",
    entityClass: selectedType?.entityClass ?? "private",
    liability: selectedType?.liability ?? "shares",
    capital: isGuarantee ? 0 : authCap || 0,
    paidCapital: isGuarantee ? 0 : Number(paidCap || 0),
    members: isGuarantee ? Number(numShar || 0) : undefined,
    directors: dirCount || undefined,
    state,
  };
  const estimate = useFeeEstimate(feeContext, !!user);
  const docSections = useMemo(() => buildDocs(typeValue), [typeValue]);

  // Legal name suffix: the catalog variant's configured suffix wins, otherwise
  // the type's built-in default. A "/"-separated value is a choice (Section 8).
  const { variants: companyVariants } = useCatalogFamily("company");
  const catalogSuffix = useMemo(() => {
    const map: Record<string, string> = {};
    (companyVariants ?? []).forEach((v) => {
      const key = v.slug.replace(/^company-/, "");
      const s = resolveWizardRules(key, v.wizardRules).suffix;
      if (s) map[key] = s;
    });
    return map;
  }, [companyVariants]);
  const typeKey = (selectedType?.slug ?? "").replace(/^company-/, "");
  const baseSuffix = (catalogSuffix[typeKey] || selectedType?.suffix || "").trim();
  const suffixOptions = baseSuffix.split("/").map((s) => s.trim()).filter(Boolean);
  const hasSuffixChoice = suffixOptions.length > 1;
  const effectiveSuffix = hasSuffixChoice ? suffixChoice || suffixOptions[0] : baseSuffix;
  const withSuffix = (n: string) => {
    const t = n.trim();
    return t ? `${t} ${effectiveSuffix}`.trim() : "";
  };
  // Reset the picked suffix when the type (and its allowed endings) changes.
  useEffect(() => {
    setSuffixChoice(suffixOptions.length > 1 ? suffixOptions[0] : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeValue]);

  async function checkName(idx: number) {
    const val = (names[idx] || "").trim();
    if (!val) {
      setNameStatus((s) => s.map((x, i) => (i === idx ? { state: "done", ok: false, msg: "Enter a name first" } : x)));
      return;
    }
    setNameStatus((s) => s.map((x, i) => (i === idx ? { state: "checking" } : x)));
    try {
      const res = await fetch(`${BACKEND}/api/mca/name-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: val }),
      });
      const data = await res.json();
      const ok = !!data.available;
      setNameStatus((s) =>
        s.map((x, i) =>
          i === idx
            ? { state: "done", ok, msg: ok ? (data.message || "Likely available — you may proceed") : (data.reason || "Not available") }
            : x,
        ),
      );
    } catch {
      setNameStatus((s) => s.map((x, i) => (i === idx ? { state: "done", ok: false, msg: "Could not check right now" } : x)));
    }
  }

  function validate(key: string): boolean {
    const e: Record<string, string> = {};
    let msg: string | null = null;
    if (key === "type") {
      if (!typeValue) { e.type = "Please select a company type."; msg = "Select a company type to continue."; }
    } else if (key === "name") {
      if (!names[0].trim()) { e.name0 = "Enter at least one name preference."; msg = "Name Preference 1 is required."; }
    } else if (key === "details") {
      if (!mainObjects.trim()) { e.mainObjects = "Describe your main objects."; msg = "Main objects are required."; }
      if (!numDir) { e.numDir = "Enter number of directors."; msg = msg || "Number of directors is required."; }
      if (!numShar) { e.numShar = "Enter number of shareholders."; msg = msg || "Number of shareholders is required."; }
      if (!state.trim()) { e.state = "Select a state."; msg = msg || "State is required."; }
      if (!city.trim()) { e.city = "Enter city."; msg = msg || "City is required."; }
      if (!/^\d{6}$/.test(pin.trim())) { e.pin = "Enter a valid 6-digit pincode."; msg = msg || "Valid pincode required."; }
      if (!addr.trim()) { e.addr = "Enter the full registered office address."; msg = msg || "Address is required."; }
    } else if (key === "capital") {
      if (!authCap) { e.authCap = "Select authorised capital."; msg = "Authorised capital is required."; }
      const pc = Number(paidCap || 0);
      if (!pc) { e.paidCap = "Enter paid-up capital."; msg = msg || "Paid-up capital is required."; }
      else if (pc > authCap) { e.paidCap = "Cannot exceed authorised capital."; msg = msg || "Paid-up cannot exceed authorised capital."; }
    }
    setErrors(e);
    setStepError(msg);
    return Object.keys(e).length === 0 && !msg;
  }

  const stepKey = STEPS[step].key;

  const next = () => {
    if (validate(stepKey)) {
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
      setStepError(null);
      setErrors({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const back = () => { setStep((s) => Math.max(0, s - 1)); setStepError(null); setErrors({}); };
  const goTo = (target: number) => {
    if (target <= step) { setStep(target); setStepError(null); setErrors({}); return; }
    if (validate(stepKey)) { setStep(target); setStepError(null); setErrors({}); }
  };

  // Effective shareholder count for the record (directors + extras when they differ).
  const effectiveShareholders = sameDirShar ? Number(numShar || 0) : Number(numShar || 0) + Number(extraShar || 0);

  const submitFormData: Record<string, unknown> = {
    companyType: typeValue,
    // Proposed names are filed with the legal suffix appended.
    name1: withSuffix(names[0]),
    ...(names[1]?.trim() ? { name2: withSuffix(names[1]) } : {}),
    ...(names[2]?.trim() ? { name3: withSuffix(names[2]) } : {}),
    ...(effectiveSuffix ? { suffix: effectiveSuffix } : {}),
    objects: mainObjects,
    ...(industries.length ? { industries: industries.join(", ") } : {}),
    directors: dirCount,
    shareholders: Number(numShar || 0),
    directorsAreShareholders: sameDirShar ? "Yes" : "No",
    ...(sameDirShar ? {} : { additionalShareholders: Number(extraShar || 0) }),
    ...(dins.some((d) => d.din || d.name)
      ? { existingDins: dins.filter((d) => d.din || d.name).map((d) => `${d.din || "New DIN"} — ${d.name || "—"}`).join("; ") }
      : {}),
    address: addr, city, state, pincode: pin,
    authorisedCapital: authCap,
    paidUpCapital: Number(paidCap || 0),
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden gradient-hero text-white">
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, oklch(0.7 0.19 45 / 0.4), transparent 40%), radial-gradient(circle at 80% 80%, oklch(0.6 0.18 240 / 0.5), transparent 45%)" }} />
        <div className="hero-grid" />
        <div className="relative px-6 md:px-10 py-10 max-w-5xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[11px] mono uppercase tracking-widest text-white/90">
            <span className="size-1.5 rounded-full bg-primary live-dot" /> Companies Act, 2013 · MCA21
          </span>
          <h1 className="mt-4 text-4xl md:text-[42px] font-semibold font-display tracking-tight leading-[1.05]">
            Company Incorporation Wizard
          </h1>
          <p className="mt-3 text-white/70 max-w-2xl text-[15px] leading-relaxed">
            A guided Cloudcrest BM workspace — choose your entity, check names, capture directors &amp; capital, see an indicative fee estimate and the document checklist, then submit.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {HIGHLIGHTS.map((h) => (
              <span key={h.label} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/12 border border-white/15 text-[12px] text-white/90">
                <h.icon className="size-3.5 text-primary" /> {h.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Main Flex Body */}
      <div className="flex">
        {/* Left/Center Content */}
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-6 md:px-10 py-8 animate-in-up">
            <div className="rounded-xl border border-border bg-surface shadow-card p-4">
              <Stepper steps={STEPS} current={step} onGo={goTo} />
            </div>

            {stepError && (
              <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 flex items-center gap-2.5 text-xs text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                <span className="font-semibold">{stepError}</span>
              </div>
            )}

            <div key={step} className="mt-8 animate-in-up">
              {/* STEP 1 — TYPE */}
              {stepKey === "type" && (
                <Section title="Select Entity & Company Type" desc="All registrations under Companies Act, 2013, filed through the MCA21 portal.">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {COMPANY_TYPES.map((t) => {
                      const Icon = t.icon;
                      const active = typeValue === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => { setTypeValue(t.value); setErrors({}); setStepError(null); }}
                          className={"text-left p-4 rounded-xl border transition-all hover-lift ring-focus " + (active ? "border-primary ring-2 ring-primary/25 bg-primary/[0.05]" : "border-border bg-surface hover:border-primary/50")}
                        >
                          <span className={"inline-grid place-items-center size-9 rounded-lg mb-2.5 " + (active ? "gradient-brand text-white" : "bg-primary/10 text-primary")}>
                            <Icon className="size-4.5" />
                          </span>
                          <div className="text-sm font-semibold leading-tight">{t.value}</div>
                          <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{t.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                  {errors.type && <ErrText>{errors.type}</ErrText>}
                </Section>
              )}

              {/* STEP 2 — NAME */}
              {stepKey === "name" && (
                <Section title="Company Name Selection" desc="Propose up to 3 preferences. Each is filed with the legal suffix for your company type, and must be unique.">
                  <InfoBox>Names with "National", "India", "Bharat", "Bank", "Insurance" or "Government" require Central Government approval.</InfoBox>
                  <Field label="Legal Suffix">
                    {hasSuffixChoice ? (
                      <select value={suffixChoice} onChange={(e) => setSuffixChoice(e.target.value)} className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus">
                        {suffixOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <div className="text-sm mono px-3 py-2.5 rounded-lg bg-muted/50 border border-border">{effectiveSuffix || "— (no standard suffix for this type)"}</div>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {selectedType?.short ?? "This type"} names are filed ending in this legal suffix.
                    </p>
                  </Field>
                  {[0, 1, 2].map((i) => {
                    const st = nameStatus[i];
                    return (
                      <Field key={i} label={i === 0 ? "Name Preference 1 *" : `Name Preference ${i + 1}`} error={i === 0 ? errors.name0 : undefined}>
                        <div className="flex gap-2">
                          <Input
                            value={names[i]}
                            onChange={(v) => { setNames((n) => n.map((x, j) => (j === i ? v : x))); setNameStatus((s) => s.map((x, j) => (j === i ? null : x))); if (i === 0) setErrors((e) => ({ ...e, name0: "" })); }}
                            placeholder={i === 0 ? "e.g. Cloudcrest Solutions Private Limited" : "Alternate preference…"}
                            error={i === 0 ? errors.name0 : undefined}
                          />
                          <button type="button" onClick={() => checkName(i)} className="shrink-0 px-3.5 rounded-lg bg-navy text-navy-foreground text-xs font-bold hover:opacity-90 transition-opacity">
                            Check
                          </button>
                        </div>
                        {names[i].trim() && effectiveSuffix && (
                          <div className="mt-1.5 text-[11px] text-muted-foreground">Filed as: <span className="text-foreground font-medium">{withSuffix(names[i])}</span></div>
                        )}
                        {st?.state === "checking" && <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" /> Checking…</div>}
                        {st?.state === "done" && (
                          <div className={"mt-2 text-[11px] flex items-center gap-1.5 " + (st.ok ? "text-success" : "text-destructive")}>
                            {st.ok ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />} {st.msg}
                          </div>
                        )}
                      </Field>
                    );
                  })}
                </Section>
              )}

              {/* STEP 3 — DETAILS */}
              {stepKey === "details" && (
                <Section title="Company Details" desc="Objects, directors, shareholders, DINs and registered office.">
                  <Field label="Main Objects / Nature of Business *" error={errors.mainObjects}>
                    <Textarea value={mainObjects} onChange={(v) => { setMainObjects(v); setErrors((e) => ({ ...e, mainObjects: "" })); }} placeholder="e.g. Software development, IT consulting, digital marketing and related technology services…" error={errors.mainObjects} />
                  </Field>
                  <Field label="Industry Categories">
                    <div className="flex flex-wrap gap-2">
                      {INDUSTRY_OPTIONS.map((opt) => {
                        const on = industries.includes(opt);
                        return (
                          <button key={opt} type="button" onClick={() => setIndustries((a) => (on ? a.filter((x) => x !== opt) : [...a, opt]))}
                            className={"px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all " + (on ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground hover:border-primary/40")}>
                            {on ? "✓ " : ""}{opt}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <Divider />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Number of Directors *" error={errors.numDir}>
                      <NumberInput value={numDir} onChange={(v) => { setNumDir(v); setErrors((e) => ({ ...e, numDir: "" })); }} min={1} max={15} placeholder="e.g. 2" error={errors.numDir} />
                    </Field>
                    <Field label="Number of Shareholders *" error={errors.numShar}>
                      <NumberInput value={numShar} onChange={(v) => { setNumShar(v); setErrors((e) => ({ ...e, numShar: "" })); }} min={1} placeholder="e.g. 2" error={errors.numShar} />
                    </Field>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-panel/40 mt-1">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-foreground">Are all Directors also Shareholders?</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {sameDirShar ? "Yes — every director holds shares in the company." : "No — some shareholders are not directors."}
                      </div>
                    </div>
                    <span className={"text-[11px] font-bold mono uppercase tracking-wider shrink-0 " + (sameDirShar ? "text-success" : "text-muted-foreground")}>
                      {sameDirShar ? "Yes" : "No"}
                    </span>
                    <Toggle checked={sameDirShar} onChange={setSameDirShar} label="Are all Directors also Shareholders" />
                  </div>
                  {!sameDirShar && (
                    <Field label="Additional Shareholders (non-directors)">
                      <NumberInput value={extraShar} onChange={setExtraShar} min={0} placeholder="e.g. 1" />
                    </Field>
                  )}
                  <Divider />
                  <Field label="Existing DINs">
                    <div className="space-y-2">
                      {dins.map((d, i) => (
                        <div key={i} className="flex gap-2">
                          <input value={d.din} maxLength={8} onChange={(e) => setDins((a) => a.map((x, j) => (j === i ? { ...x, din: e.target.value } : x)))} placeholder="DIN (8 digits)" className="w-36 bg-input border border-border rounded-lg px-3 py-2.5 text-sm mono ring-focus" />
                          <input value={d.name} onChange={(e) => setDins((a) => a.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Director Name" className="flex-1 bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus" />
                          {i === dins.length - 1 ? (
                            <button type="button" onClick={() => setDins((a) => [...a, { din: "", name: "" }])} className="shrink-0 size-[42px] grid place-items-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20"><Plus className="size-4" /></button>
                          ) : (
                            <button type="button" onClick={() => setDins((a) => a.filter((_, j) => j !== i))} className="shrink-0 size-[42px] grid place-items-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20"><Minus className="size-4" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">Leave blank if DIN not yet allotted — new directors can apply via SPICe+.</p>
                  </Field>
                  <Divider />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="State *" error={errors.state}>
                      <select value={state} onChange={(e) => { setState(e.target.value); setErrors((x) => ({ ...x, state: "" })); }} className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus">
                        {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </Field>
                    <Field label="City *" error={errors.city}>
                      <Input value={city} onChange={(v) => { setCity(v); setErrors((e) => ({ ...e, city: "" })); }} placeholder="Hyderabad" error={errors.city} />
                    </Field>
                    <Field label="Pincode *" error={errors.pin}>
                      <Input value={pin} onChange={(v) => { setPin(v); setErrors((e) => ({ ...e, pin: "" })); }} placeholder="500032" error={errors.pin} />
                    </Field>
                  </div>
                  <Field label="Full Registered Office Address *" error={errors.addr}>
                    <Textarea value={addr} onChange={(v) => { setAddr(v); setErrors((e) => ({ ...e, addr: "" })); }} placeholder="Plot No., Street, Area, Landmark…" rows={2} error={errors.addr} />
                  </Field>
                </Section>
              )}

              {/* STEP 4 — CAPITAL */}
              {stepKey === "capital" && (
                <Section title="Capital Structure" desc="Authorised and paid-up capital. This determines the ROC filing fee.">
                  <InfoBox><strong>Authorised Capital</strong> = maximum the company can raise. <strong>Paid-up</strong> = amount actually received (cannot exceed authorised).</InfoBox>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Authorised Capital *" error={errors.authCap}>
                      <select value={authCapSel} onChange={(e) => { setAuthCapSel(e.target.value); setErrors((x) => ({ ...x, authCap: "" })); }} className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus">
                        <option value="">Select amount</option>
                        {AUTH_CAP_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        <option value="custom">Custom</option>
                      </select>
                      {authCapSel === "custom" && (
                        <div className="mt-2"><NumberInput value={authCapCustom} onChange={setAuthCapCustom} min={100000} placeholder="Enter in ₹" /></div>
                      )}
                    </Field>
                    <Field label="Paid-up / Subscribed Capital *" error={errors.paidCap}>
                      <NumberInput value={paidCap} onChange={(v) => { setPaidCap(v); setErrors((e) => ({ ...e, paidCap: "" })); }} min={0} placeholder="Enter in ₹" error={errors.paidCap} />
                    </Field>
                  </div>
                  {authCap > 0 && (
                    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-accent/[0.04] p-4 flex flex-wrap gap-x-10 gap-y-3">
                      <Stat label="Authorised Capital" value={inr(authCap)} tone="primary" />
                      <Stat label="Paid-up Capital" value={paidCap ? inr(Number(paidCap)) : "—"} tone="primary" />
                      <div className="self-center text-[11px] text-muted-foreground max-w-[16rem]">
                        Government fees for this capital are itemised on the next step.
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* STEP 5 — FEES (from the backend engine) */}
              {stepKey === "fees" && (
                <Section title="Fee Estimation" desc="Itemised government + professional fees for your incorporation.">
                  {!user ? (
                    <div className="rounded-xl border border-border bg-panel/40 p-6 text-center">
                      <Lock className="size-5 text-primary mx-auto mb-2" />
                      <h3 className="text-sm font-semibold">Sign in to view fees</h3>
                      <p className="text-[13px] text-muted-foreground mt-1.5 max-w-sm mx-auto">The fee breakdown includes professional fees and is available to signed-in customers.</p>
                      <button onClick={() => setOpenSignIn(true)} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand">
                        Sign in to continue <ArrowRight className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl border border-warning/30 bg-warning/8 p-3.5 flex gap-2.5 text-xs text-foreground/80 mb-4">
                        <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
                        <span>Indicative estimate recomputed on submission. Government/stamp fees are budgeting approximations — always cross-check the live MCA SPICe+ calculator before filing.{!estimate.stateKnown ? " Stamp duty for the selected state isn't on file yet, so it's shown as ₹0." : ""}</span>
                      </div>
                      {estimate.loading ? (
                        <div className="text-xs text-muted-foreground py-6 text-center">Loading current pricing…</div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                                <th className="text-left px-3.5 py-2.5 font-bold">Component</th>
                                <th className="text-right px-3.5 py-2.5 font-bold">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {estimate.lines.map((l) => (
                                <tr key={l.label} className="border-t border-border">
                                  <td className="px-3.5 py-2.5 font-medium">{l.label}</td>
                                  <td className="px-3.5 py-2.5 text-right font-semibold mono">{inr(l.amount)}</td>
                                </tr>
                              ))}
                              <tr className="border-t border-border bg-primary/[0.06]">
                                <td className="px-3.5 py-3 font-bold text-primary">Estimated Total</td>
                                <td className="px-3.5 py-3 text-right font-bold text-primary mono text-base">{inr(estimate.total)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </Section>
              )}

              {/* STEP 6 — DOCS */}
              {stepKey === "docs" && (
                <Section title="Required Documents" desc={`Checklist tailored to ${selectedType?.short ?? "your company"}.`}>
                  {docSections.map((sec) => (
                    <div key={sec.title} className="mb-5 last:mb-0">
                      <h3 className="text-sm font-semibold flex items-center gap-2 mb-2.5">
                        <span className={"w-1 h-4 rounded " + (sec.tone === "success" ? "bg-success" : "bg-primary")} />
                        {sec.title}
                      </h3>
                      <ul className="space-y-2">
                        {sec.docs.map((d) => (
                          <li key={d} className="flex items-start gap-2.5 text-[13px]">
                            <CheckCircle2 className={"size-4 shrink-0 mt-0.5 " + (sec.tone === "success" ? "text-success" : "text-primary")} />
                            <span className="text-foreground/85">{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </Section>
              )}

              {/* STEP 7 — SUMMARY */}
              {stepKey === "summary" && (
                <Section title="Incorporation Summary" desc="Review your application, then submit to the Cloudcrest BM team.">
                  <SummaryBlock title="Entity" rows={[["Company Type", typeValue || "—"]]} />
                  <SummaryBlock title="Proposed Names" rows={names.filter((n) => n.trim()).map((n, i) => [`Preference ${i + 1}`, withSuffix(n)])} />
                  <SummaryBlock title="Business Details" rows={[["Main Objects", mainObjects || "—"], ["Industries", industries.join(", ") || "—"]]} />
                  <SummaryBlock title="Management" rows={[
                    ["Directors", String(dirCount)],
                    ["Shareholders", String(Number(numShar || 0))],
                    ["Directors = Shareholders", sameDirShar ? "Yes" : "No"],
                    ...(!sameDirShar ? ([["Additional Shareholders", String(Number(extraShar || 0))]] as [string, string][]) : []),
                    ["Existing DINs", dins.some((d) => d.din || d.name) ? dins.filter((d) => d.din || d.name).map((d) => `${d.din || "New"} — ${d.name || "—"}`).join("; ") : "None"],
                  ]} />
                  <SummaryBlock title="Registered Office" rows={[["State", state], ["City", city || "—"], ["Pincode", pin || "—"], ["Address", addr || "—"]]} />
                  <SummaryBlock title="Capital" rows={[["Authorised", inr(authCap)], ["Paid-up", inr(Number(paidCap || 0))]]} />
                  <SummaryBlock title="Fee Estimate" rows={[["Total (Govt + Prof + GST)", user ? inr(estimate.total) : "Sign in on the Fees step to view"], ["Note", "Recomputed authoritatively on submission; stamp duty finalised per state"]]} />
                </Section>
              )}
            </div>

            {/* Actions */}
            <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
              <button onClick={back} disabled={step === 0} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-all">
                <ArrowLeft className="size-3.5" /> Previous
              </button>
              {step === STEPS.length - 1 ? (
                <button onClick={() => (user ? setOpenReg(true) : setOpenSignIn(true))} className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-shadow">
                  <Send className="size-4" /> Submit Application
                </button>
              ) : (
                <button onClick={next} className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all">
                  Next · {STEPS[step + 1].label} <ArrowRight className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right panel — current selection & documents */}
        <aside className="hidden lg:block w-80 border-l border-border bg-surface">
          <div className="sticky top-16 p-6">
            <div className="label-eyebrow mb-2.5 text-primary">Current Selection</div>
            <div className="rounded-lg border border-border bg-panel p-3">
              <div className="text-[11px] text-muted-foreground">Entity Type</div>
              <div className="text-sm font-semibold mt-0.5">{typeValue || "—"}</div>
              <div className="text-[10px] mono text-primary mt-2">
                Form · {selectedType?.value === "Foreign Company" ? "Form FC-1" : "SPICe+ (INC-32) · AGILE-PRO-S"}
              </div>
            </div>

            <div className="mt-7">
              <div className="label-eyebrow mb-3">Documents Required</div>
              <ul className="space-y-2.5">
                {[
                  "PAN Card of all directors & shareholders",
                  "Identity proof (Aadhaar / Voter ID / Passport)",
                  "Address proof of directors (Bank Statement / Bill < 2 months)",
                  "Passport-size photographs (2 per person)",
                  "Specimen signature on plain paper",
                  "Registered office proof (Utility bill < 2 months)",
                  "Rent agreement + NOC (if rented)",
                  "Digital Signature Certificate (DSC)",
                  "MoA & AoA drafts (INC-33 & INC-34)",
                  "Consent letters (DIR-2 & INC-9)",
                ].map((doc) => (
                  <li key={doc} className="flex items-start gap-2 text-[12px]">
                    <CheckCircle2 className="size-3.5 text-success shrink-0 mt-0.5" />
                    <span className="text-foreground">{doc}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-7 rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
              <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
              <div className="text-[11px] text-foreground/70 leading-relaxed">
                Cloudcrest BM associates review every document before filing on the MCA21 portal.
              </div>
            </div>
          </div>
        </aside>
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug={selectedType?.slug || "company"}
        serviceTitle={`Company Registration — ${typeValue}`}
        authority="MCA"
        form="SPICe+ (INC-32)"
        initialEmail={applicantEmail}
        initialPhone={applicantPhone}
        capital={authCap || undefined}
        paidCapital={Number(paidCap) || undefined}
        formData={submitFormData}
        documents={docSections.flatMap((s) => s.docs)}
        fees={estimate.lines}
        feeTotal={estimate.total}
        feeContext={feeContext}
      />
      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to submit your company incorporation — we'll save your details and let our team proceed with filing."
        next="/m/company"
      />
    </div>
  );
}

/* ── primitives ── */
function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-border bg-gradient-to-br from-primary/[0.04] to-transparent">
        <h2 className="text-lg font-display font-semibold tracking-tight">{title}</h2>
        {desc && <p className="text-[13px] text-muted-foreground mt-1">{desc}</p>}
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-eyebrow mb-1.5">{label}</div>
      {children}
      {error && <ErrText>{error}</ErrText>}
    </div>
  );
}
function ErrText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] font-medium text-destructive flex items-center gap-1"><AlertTriangle className="size-3 shrink-0" />{children}</p>;
}
function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-4 border-primary/60 bg-primary/[0.05] px-3.5 py-2.5 text-[13px] text-foreground/80 flex gap-2">
      <Info className="size-4 text-primary shrink-0 mt-0.5" /> <span>{children}</span>
    </div>
  );
}
function Divider() { return <hr className="border-border" />; }
function Input({ value, onChange, placeholder, error }: { value: string; onChange: (v: string) => void; placeholder?: string; error?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={"w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " + (error ? "border-destructive focus:ring-destructive/25" : "border-border")} />;
}
function Textarea({ value, onChange, placeholder, rows = 3, error }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; error?: string }) {
  return <textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={"w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " + (error ? "border-destructive focus:ring-destructive/25" : "border-border")} />;
}
function NumberInput({ value, onChange, min = 0, max, placeholder, error }: { value: number | ""; onChange: (v: number | "") => void; min?: number; max?: number; placeholder?: string; error?: string }) {
  return <input type="number" value={value} min={min} max={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className={"w-full bg-input border rounded-lg px-3 py-2.5 text-sm mono ring-focus transition-shadow " + (error ? "border-destructive focus:ring-destructive/25" : "border-border")} />;
}
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface " +
        (checked ? "bg-primary" : "bg-muted-foreground/30")
      }
    >
      <span
        className={
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200 " +
          (checked ? "translate-x-[1.375rem]" : "translate-x-0.5")
        }
      />
    </button>
  );
}
function Stat({ label, value, tone }: { label: string; value: string; tone: "primary" | "accent" }) {
  return (
    <div>
      <div className="label-eyebrow text-muted-foreground">{label}</div>
      <div className={"text-lg font-bold mono mt-0.5 " + (tone === "accent" ? "text-warning" : "text-primary")}>{value}</div>
    </div>
  );
}
function SummaryBlock({ title, rows }: { title: string; rows: [string, string][] }) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground pb-1.5 mb-2 border-b-2 border-primary/60">{title}</h3>
      <div className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 text-[13px] py-0.5">
            <span className="font-semibold text-muted-foreground min-w-[150px] shrink-0">{k}</span>
            <span className="text-foreground">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
