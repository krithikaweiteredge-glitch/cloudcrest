import { useMemo, useState, useEffect } from "react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { useAuth } from "@/hooks/use-auth";
import { SignInDialog } from "@/components/sign-in-dialog";
import {
  useCatalogService,
  resolveFees,
  resolveDocuments,
  type ResolvedFees,
} from "@/lib/service-catalog";
import {
  AlertTriangle, Download, ArrowLeft, ArrowRight, CheckCircle2,
  Circle, FileText, Info, ShieldCheck, Zap, ClipboardList, FileDown, Send, Lock,
} from "lucide-react";

const STEPS = [
  { key: "type", label: "Type" },
  { key: "name", label: "Name" },
  { key: "details", label: "Details" },
  { key: "office", label: "Office" },
  { key: "capital", label: "Capital" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const ENTITY_TYPES = [
  { key: "pvt", title: "Private Limited Company", suffix: "Private Limited", form: "SPICe+ INC-32", tags: ["FDI Friendly", "Min 2 Dir"], pop: true },
  { key: "public", title: "Public Limited Company", suffix: "Limited", form: "SPICe+ INC-32", tags: ["Min 3 Dir · 7 Sh"] },
  { key: "opc", title: "One Person Company (OPC)", suffix: "(OPC) Private Limited", form: "SPICe+ INC-32", tags: ["Single Member"] },
  { key: "sec8", title: "Section 8 Company (Non-Profit)", suffix: "Foundation / Trust / Association", form: "INC-12", tags: ["Tax Exempt"] },
  { key: "guarantee", title: "Company Limited by Guarantee", suffix: "Limited", form: "INC-32", tags: [] },
  { key: "nidhi", title: "Nidhi Company", suffix: "Nidhi Limited", form: "INC-32 · NDH-4", tags: ["Mutual Benefit"] },
  { key: "producer", title: "Producer Company", suffix: "Producer Company Limited", form: "INC-32", tags: ["Agri / Producer"] },
  { key: "foreign", title: "Foreign Company (Branch/Liaison)", suffix: "Branch / Liaison Office", form: "FC-1", tags: ["RBI Approval"] },
];

// Used only when the admin catalog has no row for this entity type — the
// catalog (`services` table) is the source of truth for pricing.
const FALLBACK_FEES: Record<string, { professional: number; govt: number; gstPercent: number }> = {
  pvt: { professional: 2499, govt: 1500, gstPercent: 18 },
  public: { professional: 6499, govt: 3500, gstPercent: 18 },
  opc: { professional: 2499, govt: 1500, gstPercent: 18 },
  sec8: { professional: 4499, govt: 2000, gstPercent: 18 },
  guarantee: { professional: 3499, govt: 1700, gstPercent: 18 },
  nidhi: { professional: 8499, govt: 4000, gstPercent: 18 },
  producer: { professional: 6499, govt: 3500, gstPercent: 18 },
  foreign: { professional: 14999, govt: 7000, gstPercent: 18 },
};

// Fallback checklist when the admin hasn't configured document types.
const FALLBACK_DOCS = [
  "PAN & Aadhaar of all directors",
  "Passport-size photographs",
  "Address proof (utility bill < 2 mo)",
  "Registered office proof",
  "Rent agreement + NOC (if rented)",
  "Digital Signature Certificate (DSC)",
  "MoA & AoA drafts",
];

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Real Validations" },
  { icon: Zap, label: "Dynamic Fee Estimate" },
  { icon: ClipboardList, label: "Document Checklist" },
  { icon: FileDown, label: "Downloadable Summary" },
];

function format10DigitPhone(phoneStr?: string | null): string {
  if (!phoneStr) return "";
  let cleaned = phoneStr.trim();
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("91") && cleaned.length > 10) {
    cleaned = cleaned.slice(2);
  }
  cleaned = cleaned.replace(/\D/g, "");
  if (cleaned.length > 10) {
    cleaned = cleaned.slice(-10);
  }
  return cleaned;
}

export function CompanyWizard({ initialName }: { initialName?: string }) {
  const { user } = useAuth();

  const [step, setStep] = useState(initialName ? 1 : 0);
  const [entity, setEntity] = useState("pvt");
  // Some entity types offer a choice of legal suffix (e.g. Section 8 →
  // "Foundation / Trust / Association"). This holds the one the user picked.
  const [suffixChoice, setSuffixChoice] = useState("");
  const [name1, setName1] = useState(initialName || "");
  const [name2, setName2] = useState("");
  const [state, setState] = useState("Maharashtra");
  const [directors, setDirectors] = useState(2);
  const [shareholders, setShareholders] = useState(2);
  const [capital, setCapital] = useState(100000);
  const [paidCapital, setPaidCapital] = useState(100000);
  const [objects, setObjects] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [nominee, setNominee] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [applicantPhone, setApplicantPhone] = useState("");

  useEffect(() => {
    if (!user) return;
    setApplicantEmail((prev) => prev || user.email || "");
    setApplicantPhone((prev) => prev || format10DigitPhone(user.phone));

    fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/profiles/me`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setApplicantEmail((prev) => prev || data.user.email || user.email || "");
          setApplicantPhone((prev) => prev || format10DigitPhone(data.user.phone || user.phone));
        }
      })
      .catch((err) => console.error("Error prefilling wizard profile:", err));
  }, [user]);

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  const selected = ENTITY_TYPES.find((e) => e.key === entity)!;

  // A "/"-separated suffix means the entity permits several legal endings and
  // the applicant must pick exactly one (e.g. Foundation OR Trust OR
  // Association). A single suffix is used as-is.
  const suffixOptions = selected.suffix
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const hasSuffixChoice = suffixOptions.length > 1;
  const effectiveSuffix =
    hasSuffixChoice && suffixChoice ? suffixChoice : hasSuffixChoice ? suffixOptions[0] : selected.suffix;

  // Reset the picked suffix to the first valid option whenever the entity (and
  // therefore its allowed suffixes) changes.
  useEffect(() => {
    setSuffixChoice(suffixOptions.length > 1 ? suffixOptions[0] : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  // Pricing & checklist come from the admin catalog. A per-entity row
  // (`company-pvt`) wins over the base `company` service when one exists.
  const { service, loading: catalogLoading } = useCatalogService([`company-${entity}`, "company"]);
  const fees = resolveFees(service, "MCA", FALLBACK_FEES[entity]);
  const total = fees.total;
  const { documents, fromCatalog: docsFromCatalog } = resolveDocuments(service, FALLBACK_DOCS);

  // The proposed names are stored with the entity suffix appended, so the record
  // holds the full company name (e.g. "ACME TECH SOLUTIONS Private Limited").
  const withSuffix = (n: string) => {
    const t = n.trim();
    return t ? `${t} ${effectiveSuffix}` : "";
  };

  const nameOk = useMemo(() => {
    if (!name1) return null;
    const len = name1.trim().length;
    const bad = /(India|National|Bharat|President|Bank)/i.test(name1);
    if (len < 3) return { ok: false, msg: "Minimum 3 characters" };
    if (bad) return { ok: false, msg: "Contains restricted keyword — needs Central Govt. approval" };
    return { ok: true, msg: "Preliminary check passed — reserve via RUN / SPICe+ Part A" };
  }, [name1]);

  const capitalCategory =
    capital <= 100000 ? "Small" : capital <= 1000000 ? "Standard" : capital <= 10000000 ? "Growth" : "Large";

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    if (currentStep === 1) {
      if (!name1.trim()) {
        newErrors.name1 = "Please enter Proposed Name 1.";
        globalMsg = "Proposed Name 1 is required.";
      } else if (name1.trim().length < 3) {
        newErrors.name1 = "Proposed Name 1 must be at least 3 characters long.";
        globalMsg = "Proposed Name 1 is too short.";
      } else if (/(India|National|Bharat|President|Bank)/i.test(name1)) {
        newErrors.name1 = "Contains restricted keyword requiring Central Govt approval.";
        globalMsg = "Proposed Name 1 contains restricted keywords.";
      }

      if (!objects.trim()) {
        newErrors.objects = "Please describe the main object / nature of business.";
        if (!globalMsg) globalMsg = "Main object of business is required.";
      } else if (objects.trim().length < 10) {
        newErrors.objects = "Main objects should be at least 10 characters long.";
        if (!globalMsg) globalMsg = "Please provide a more detailed main object description.";
      }
    } else if (currentStep === 2) {
      const minDir = entity === "public" ? 3 : entity === "opc" ? 1 : 2;
      const minShr = entity === "public" ? 7 : entity === "opc" ? 1 : 2;

      if (directors < minDir) {
        newErrors.directors = `${selected.title} requires a minimum of ${minDir} director(s).`;
        globalMsg = `Minimum required: ${minDir} director(s).`;
      }

      if (shareholders < minShr) {
        newErrors.shareholders = `${selected.title} requires a minimum of ${minShr} shareholder(s).`;
        if (!globalMsg) globalMsg = `Minimum required: ${minShr} shareholder(s).`;
      }

      if (entity === "opc" && !nominee.trim()) {
        newErrors.nominee = "Nominee name is mandatory for One Person Company (OPC).";
        if (!globalMsg) globalMsg = "OPC Nominee name is required.";
      }

      if (applicantEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail.trim())) {
        newErrors.applicantEmail = "Invalid email address format.";
        if (!globalMsg) globalMsg = "Please enter a valid applicant email.";
      }

      if (applicantPhone.trim()) {
        const cleanPhone = format10DigitPhone(applicantPhone);
        if (!cleanPhone || cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
          newErrors.applicantPhone = "Invalid 10-digit mobile number.";
          if (!globalMsg) globalMsg = "Please enter a valid 10-digit phone number.";
        }
      }
    } else if (currentStep === 3) {
      if (!address.trim()) {
        newErrors.address = "Please enter the full registered office address.";
        globalMsg = "Registered office address is required.";
      } else if (address.trim().length < 10) {
        newErrors.address = "Address should be at least 10 characters long.";
        globalMsg = "Registered office address is too short.";
      }

      if (!state.trim()) {
        newErrors.state = "Please select a state.";
        if (!globalMsg) globalMsg = "State is required.";
      }

      if (!city.trim()) {
        newErrors.city = "Please enter city / district.";
        if (!globalMsg) globalMsg = "City is required.";
      }

      if (!pincode.trim()) {
        newErrors.pincode = "Please enter a 6-digit PIN Code.";
        if (!globalMsg) globalMsg = "PIN Code is required.";
      } else if (!/^[1-9][0-9]{5}$/.test(pincode.trim())) {
        newErrors.pincode = "Must be a valid 6-digit Indian PIN Code (e.g. 400001).";
        if (!globalMsg) globalMsg = "Invalid 6-digit PIN Code.";
      }
    } else if (currentStep === 4) {
      if (!capital || capital < 10000) {
        newErrors.capital = "Authorised capital must be at least ₹10,000.";
        globalMsg = "Authorised capital must be at least ₹10,000.";
      }

      if (!paidCapital || paidCapital < 10000) {
        newErrors.paidCapital = "Paid-up capital must be at least ₹10,000.";
        if (!globalMsg) globalMsg = "Paid-up capital must be at least ₹10,000.";
      } else if (paidCapital > capital) {
        newErrors.paidCapital = "Paid-up capital cannot exceed Authorised Capital.";
        if (!globalMsg) globalMsg = "Paid-up capital cannot exceed Authorised Capital.";
      }
    }

    setErrors(newErrors);
    setStepError(globalMsg);
    return Object.keys(newErrors).length === 0 && !globalMsg;
  };

  const next = () => {
    // Advancing past the first step requires an account — the wizard collects
    // filing details and shows pricing, both of which are for signed-in users.
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

  const handleStepChange = (targetStep: number) => {
    if (targetStep > step && !user) {
      setOpenSignIn(true);
      return;
    }
    if (targetStep < step) {
      setStep(targetStep);
      setStepError(null);
      setErrors({});
    } else {
      if (validateStep(step)) {
        setStep(targetStep);
        setStepError(null);
        setErrors({});
      }
    }
  };

  const downloadSummaryPdf = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/summary/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selected.title,
          name1,
          name2,
          suffix: effectiveSuffix,
          form: selected.form,
          directors,
          shareholders,
          capital,
          objects,
          address,
          city,
          state,
          pincode,
          // Catalog-driven line items; the PDF renders whatever labels it gets.
          fees: fees.lines,
          total,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate PDF summary");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const fileName = `Filing_Summary_${name1 ? name1.trim().replace(/\s+/g, "_") : "Company"}.pdf`;
      link.download = fileName;
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
        <div className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, oklch(0.7 0.19 45 / 0.4), transparent 40%), radial-gradient(circle at 80% 80%, oklch(0.6 0.18 240 / 0.5), transparent 45%)",
          }}
        />
        {/* Panning technical grid — the same mesh the home hero uses. */}
        <div className="hero-grid" />
        <div className="relative px-10 py-10 max-w-5xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[11px] mono uppercase tracking-widest text-white/90">
            <span className="size-1.5 rounded-full bg-primary live-dot" />
            MCA · Tax · Labour · Municipal · IP Registration Desk
          </span>
          <h1 className="mt-4 text-4xl md:text-[42px] font-semibold font-display tracking-tight leading-[1.05]">
            Business Registration <br />
            {/* <span className="text-primary">Compliance Wizard</span> */}
          </h1>
          <p className="mt-3 text-white/70 max-w-2xl text-[15px] leading-relaxed">
            A guided Cloudcrest BM workspace for Company, LLP, tax registrations,
            labour law, municipal licences, industry licences and intellectual
            property filings.
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
        {/* Center */}
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-10 py-8 animate-in-up">
            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">
                Company Registration · MCA / SPICe+
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Company Incorporation Wizard
              </h2>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-[62ch]">
                V4-style validations, suffix rules, capital preview and dynamic fee
                logic — governed by the Companies Act, 2013 and MCA e-forms.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface shadow-card p-4">
              <Stepper steps={STEPS} current={step} onGo={handleStepChange} />
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
                <span className="font-semibold text-foreground">Minimum rules · </span>
                Pvt Ltd 2 directors / 2 shareholders · Public 3 / 7 · OPC 1 / 1 +
                nominee · Section 8 for non-profit objects.
              </div>
            </div>

            <div key={step} className="mt-8 animate-in-up">
              {step === 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {ENTITY_TYPES.map((t) => {
                    const active = t.key === entity;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          setEntity(t.key);
                          const minD = t.key === "public" ? 3 : t.key === "opc" ? 1 : 2;
                          const minS = t.key === "public" ? 7 : t.key === "opc" ? 1 : 2;
                          setDirectors(minD);
                          setShareholders(minS);
                          setErrors({});
                          setStepError(null);
                        }}
                        className={
                          "text-left p-4 rounded-xl bg-surface border transition-all hover-lift ring-focus " +
                          (active
                            ? "border-primary ring-2 ring-primary/25 shadow-card"
                            : "border-border hover:border-border-strong shadow-card")
                        }
                      >
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <span className="text-sm font-semibold leading-tight">
                            {t.title}
                          </span>
                          <span className="text-[9px] mono text-muted-foreground shrink-0">
                            {t.form}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mb-3">
                          Suffix: <span className="text-foreground/80">{t.suffix}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {t.pop && (
                            <span className="px-1.5 py-0.5 rounded-md bg-primary/12 text-primary text-[9px] mono uppercase tracking-wider">
                              Popular
                            </span>
                          )}
                          {t.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground text-[9px] mono uppercase tracking-wider"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {step === 1 && (
                <Card>
                  <div className="space-y-6">
                    <Field label="Proposed Name 1 *" error={errors.name1}>
                      <div className="flex gap-2">
                        <Input
                          value={name1}
                          onChange={(v) => { setName1(v); setErrors((prev) => ({ ...prev, name1: "" })); }}
                          placeholder="e.g. ACME TECH SOLUTIONS"
                          error={errors.name1}
                        />
                        {hasSuffixChoice ? (
                          <select
                            value={suffixChoice}
                            onChange={(e) => setSuffixChoice(e.target.value)}
                            title="Choose the legal suffix"
                            className="mono self-stretch shrink-0 rounded-lg border border-border bg-input text-foreground text-xs px-2 cursor-pointer focus:outline-none focus:border-primary/60 transition-colors"
                          >
                            {suffixOptions.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="mono text-xs text-muted-foreground self-center whitespace-nowrap">
                            {selected.suffix}
                          </span>
                        )}
                      </div>
                      {hasSuffixChoice && (
                        <div className="mt-1.5 text-[11px] text-muted-foreground">
                          This entity allows {suffixOptions.length} suffixes — pick the one you want; it applies to both names.
                        </div>
                      )}
                      {nameOk && (
                        <div
                          className={
                            "mt-2 text-[11px] flex items-center gap-1.5 " +
                            (nameOk.ok ? "text-success" : "text-destructive")
                          }
                        >
                          {nameOk.ok ? (
                            <CheckCircle2 className="size-3" />
                          ) : (
                            <AlertTriangle className="size-3" />
                          )}
                          {nameOk.msg}
                        </div>
                      )}
                    </Field>
                    <Field label="Proposed Name 2 (Alternate)">
                      <div className="flex gap-2">
                        <Input value={name2} onChange={setName2} placeholder="Optional alternate name" />
                        <span className="mono text-xs text-muted-foreground self-center whitespace-nowrap">
                          {effectiveSuffix}
                        </span>
                      </div>
                    </Field>
                    <Field label="Object / Industry *" error={errors.objects}>
                      <textarea
                        value={objects}
                        onChange={(e) => { setObjects(e.target.value); setErrors((prev) => ({ ...prev, objects: "" })); }}
                        rows={3}
                        placeholder="Main object of the company (e.g. software development, IT services, trading…)"
                        className={
                          "w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " +
                          (errors.objects ? "border-destructive focus:ring-destructive/25" : "border-border")
                        }
                      />
                    </Field>
                  </div>
                </Card>
              )}

              {step === 2 && (
                <Card>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Number of Directors *" error={errors.directors}>
                      <NumberInput
                        value={directors}
                        onChange={(v) => { setDirectors(v); setErrors((prev) => ({ ...prev, directors: "" })); }}
                        min={1}
                        max={15}
                        error={errors.directors}
                      />
                    </Field>
                    <Field label="Number of Shareholders *" error={errors.shareholders}>
                      <NumberInput
                        value={shareholders}
                        onChange={(v) => { setShareholders(v); setErrors((prev) => ({ ...prev, shareholders: "" })); }}
                        min={1}
                        max={200}
                        error={errors.shareholders}
                      />
                    </Field>
                    {entity === "opc" && (
                      <Field label="OPC Nominee Name *" error={errors.nominee}>
                        <Input
                          value={nominee}
                          onChange={(v) => { setNominee(v); setErrors((prev) => ({ ...prev, nominee: "" })); }}
                          placeholder="Nominee Full Name"
                          error={errors.nominee}
                        />
                      </Field>
                    )}
                    <Field label="Applicant Email" error={errors.applicantEmail}>
                      <Input
                        value={applicantEmail}
                        onChange={(v) => { setApplicantEmail(v); setErrors((prev) => ({ ...prev, applicantEmail: "" })); }}
                        placeholder="applicant@company.in"
                        error={errors.applicantEmail}
                      />
                    </Field>
                    <Field label="Applicant Mobile" error={errors.applicantPhone}>
                      <Input
                        value={applicantPhone}
                        onChange={(v) => {
                          const clean = format10DigitPhone(v);
                          setApplicantPhone(clean);
                          setErrors((prev) => ({ ...prev, applicantPhone: "" }));
                        }}
                        placeholder="9876543210"
                        error={errors.applicantPhone}
                      />
                    </Field>
                  </div>
                </Card>
              )}

              {step === 3 && (
                <Card>
                  <div className="space-y-4">
                    <Field label="Registered Office Address *" error={errors.address}>
                      <textarea
                        rows={3}
                        value={address}
                        onChange={(e) => { setAddress(e.target.value); setErrors((prev) => ({ ...prev, address: "" })); }}
                        placeholder="Building Name, Flat/Door No., Street, Locality"
                        className={
                          "w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " +
                          (errors.address ? "border-destructive focus:ring-destructive/25" : "border-border")
                        }
                      />
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Field label="State *" error={errors.state}>
                        <select
                          value={state}
                          onChange={(e) => { setState(e.target.value); setErrors((prev) => ({ ...prev, state: "" })); }}
                          className={
                            "w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " +
                            (errors.state ? "border-destructive focus:ring-destructive/25" : "border-border")
                          }
                        >
                          {["Maharashtra","Karnataka","Delhi","Tamil Nadu","Gujarat","Telangana","West Bengal","Uttar Pradesh"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="City / District *" error={errors.city}>
                        <Input
                          value={city}
                          onChange={(v) => { setCity(v); setErrors((prev) => ({ ...prev, city: "" })); }}
                          placeholder="Mumbai"
                          error={errors.city}
                        />
                      </Field>
                      <Field label="PIN Code *" error={errors.pincode}>
                        <Input
                          value={pincode}
                          onChange={(v) => { setPincode(v); setErrors((prev) => ({ ...prev, pincode: "" })); }}
                          placeholder="400001"
                          error={errors.pincode}
                        />
                      </Field>
                    </div>
                  </div>
                </Card>
              )}

              {step === 4 && (
                <Card>
                  <div className="space-y-6">
                    <Field label="Authorised Capital (INR) *" error={errors.capital}>
                      <div className="flex items-center gap-3">
                        <NumberInput
                          value={capital}
                          onChange={(v) => { setCapital(v); setErrors((prev) => ({ ...prev, capital: "" })); }}
                          min={10000}
                          step={10000}
                          error={errors.capital}
                        />
                        <span className="px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20 text-[10px] mono uppercase tracking-wider text-primary">
                          {capitalCategory}
                        </span>
                      </div>
                    </Field>
                    <Field label="Paid-up Capital (INR) *" error={errors.paidCapital}>
                      <NumberInput
                        value={paidCapital}
                        onChange={(v) => { setPaidCapital(v); setErrors((prev) => ({ ...prev, paidCapital: "" })); }}
                        min={10000}
                        step={10000}
                        error={errors.paidCapital}
                      />
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[100000, 1000000, 10000000].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setCapital(c);
                            if (paidCapital > c) setPaidCapital(c);
                            setErrors({});
                          }}
                          className={
                            "p-3 rounded-lg border text-left transition-all hover-lift " +
                            (capital === c
                              ? "border-primary bg-primary/5"
                              : "border-border bg-surface hover:border-border-strong")
                          }
                        >
                          <div className="label-eyebrow">Preset</div>
                          <div className="mono text-sm mt-1 font-semibold">
                            ₹ {c.toLocaleString("en-IN")}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {step === 5 && (
                <FeeBreakdown
                  fees={fees}
                  loading={catalogLoading}
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                />
              )}

              {step === 6 && (
                <SummaryPreview
                  selected={selected}
                  suffix={effectiveSuffix}
                  name1={name1}
                  state={state}
                  directors={directors}
                  shareholders={shareholders}
                  capital={capital}
                  total={total}
                />
              )}
            </div>

            {/* Wizard actions */}
            <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
              <button
                onClick={back}
                disabled={step === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-all"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
              <div className="flex items-center gap-4">
                {step === STEPS.length - 1 ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={downloadSummaryPdf}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-muted transition-colors"
                    >
                      <Download className="size-4" /> Summary
                    </button>
                    <button
                      onClick={() => setOpenReg(true)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-shadow"
                    >
                      <Send className="size-4" /> Submit Application
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={next}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all"
                  >
                    Next · {STEPS[step + 1].label}
                    <ArrowRight className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right panel — checklist only */}
        <aside className="hidden lg:block w-80 border-l border-border bg-surface">
          <div className="sticky top-16 p-6">
            <div className="label-eyebrow mb-2.5 text-primary">Current Selection</div>
            <div className="rounded-lg border border-border bg-panel p-3">
              <div className="text-[11px] text-muted-foreground">Entity Type</div>
              <div className="text-sm font-semibold mt-0.5">{selected.title}</div>
              <div className="text-[10px] mono text-primary mt-2">
                Form · {selected.form}
              </div>
            </div>

            <div className="mt-7">
              <div className="label-eyebrow mb-3">
                Documents Required
                {!docsFromCatalog && !catalogLoading && (
                  <span className="ml-1.5 normal-case tracking-normal text-muted-foreground/70">
                    (indicative)
                  </span>
                )}
              </div>
              <ul className="space-y-2.5">
                {documents.map((label) => (
                  <li key={label} className="flex items-start gap-2 text-[12px]">
                    <CheckCircle2 className="size-3.5 text-success shrink-0 mt-0.5" />
                    <span className="text-foreground">{label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-7 rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
              <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
              <div className="text-[11px] text-foreground/70 leading-relaxed">
                Cloudcrest BM associates review every document before filing on the
                MCA portal.
              </div>
            </div>
          </div>
        </aside>
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="company"
        serviceTitle={`Company Registration — ${selected.title}`}
        authority="MCA"
        form={selected.form}
        initialEmail={applicantEmail}
        initialPhone={applicantPhone}
        capital={capital}
        paidCapital={paidCapital}
        formData={{
          name1: withSuffix(name1),
          name2: withSuffix(name2),
          suffix: effectiveSuffix,
          objects,
          address,
          city,
          state,
          pincode,
          directors,
          shareholders,
          capital,
          paidCapital,
        }}
        documents={documents}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your company incorporation — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/company"
      />
    </div>
  );
}

/* -------- primitives -------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6">
      {children}
    </div>
  );
}
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-eyebrow mb-1.5">{label}</div>
      {children}
      {error && (
        <p className="mt-1 text-[11px] font-medium text-destructive flex items-center gap-1 animate-in fade-in-50">
          <AlertTriangle className="size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
function Input({
  value, onChange, placeholder, error,
}: { value: string; onChange: (v: string) => void; placeholder?: string; error?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={
        "w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " +
        (error ? "border-destructive focus:ring-destructive/25" : "border-border")
      }
    />
  );
}
function NumberInput({
  value, onChange, min = 0, max, step = 1, error,
}: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; error?: string }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className={
        "w-full bg-input border rounded-lg px-3 py-2.5 text-sm mono ring-focus transition-shadow " +
        (error ? "border-destructive focus:ring-destructive/25" : "border-border")
      }
    />
  );
}

function FeeStack({ fees }: { fees: ResolvedFees }) {
  return (
    <div className="space-y-2.5">
      {fees.lines.map((line) => (
        <div key={line.label} className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">{line.label}</span>
          <span className="mono text-foreground">₹ {line.amount.toLocaleString("en-IN")}</span>
        </div>
      ))}
      <div className="pt-3 mt-2 border-t border-border flex justify-between items-baseline">
        <span className="text-xs font-semibold">Total Estimate</span>
        <span className="mono text-2xl font-semibold text-primary">
          ₹ {fees.total.toLocaleString("en-IN")}
        </span>
      </div>
    </div>
  );
}

function FeeBreakdown({
  fees,
  loading,
  signedIn,
  onSignIn,
}: {
  fees: ResolvedFees;
  loading: boolean;
  signedIn: boolean;
  onSignIn: () => void;
}) {
  // Pricing is for customers only — the backend withholds it when signed out.
  if (!signedIn) {
    return (
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
          onClick={onSignIn}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all"
        >
          Sign in to continue <ArrowRight className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Fee Breakdown</h3>
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground py-4">Loading current pricing…</div>
      ) : (
        <FeeStack fees={fees} />
      )}
      <div className="mt-6 text-[11px] text-muted-foreground border-t border-border pt-4 leading-relaxed">
        This estimate covers name reservation, SPICe+ Part A &amp; B, DSC, PAN,
        TAN and INC-33/34. Additional state-specific stamp duty may apply.
        {!fees.fromCatalog && !loading && (
          <>
            {" "}
            <span className="text-warning">
              Indicative pricing — confirmed by your advisor before payment.
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryPreview({
  selected, suffix, name1, state, directors, shareholders, capital, total,
}: {
  selected: { title: string; suffix: string; form: string };
  suffix: string;
  name1: string; state: string; directors: number; shareholders: number;
  capital: number; total: number;
}) {
  const rows = [
    ["Entity", selected.title],
    ["Proposed Name", name1 ? `${name1} ${suffix}` : "—"],
    ["Filing Form", selected.form],
    ["Directors", String(directors)],
    ["Shareholders", String(shareholders)],
    ["Authorised Capital", `₹ ${capital.toLocaleString("en-IN")}`],
    ["Registered State", state],
    ["Total Estimate", `₹ ${total.toLocaleString("en-IN")}`],
  ];
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="label-eyebrow text-primary">Application Summary · Draft</div>
        <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning">
          NOT SUBMITTED
        </span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between items-baseline border-b border-border pb-2.5">
            <dt className="text-[11px] text-muted-foreground uppercase tracking-wider">{k}</dt>
            <dd className="text-sm font-semibold mono text-foreground text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
