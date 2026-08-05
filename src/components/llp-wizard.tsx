import { useMemo, useState, useEffect } from "react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { useAuth } from "@/hooks/use-auth";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useCatalogService, resolveDocuments, type ResolvedFees } from "@/lib/service-catalog";
import { useFeeEstimate, type FeeContext } from "@/lib/fees-api";
import { INDIAN_STATES, INDUSTRY_TYPES } from "@/lib/form-options";
import {
  AlertTriangle, Download, ArrowLeft, ArrowRight, CheckCircle2,
  Circle, FileText, Info, ShieldCheck, Zap, ClipboardList, FileDown, Send, User, Building2, Coins, Lock
} from "lucide-react";

const STEPS = [
  { key: "name", label: "Name" },
  { key: "partners", label: "Partners" },
  { key: "office", label: "Office" },
  { key: "capital", label: "Contribution" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

// Only the standard LLP is offered — the entity-type step was removed, so any
// other type would be unreachable.
const LLP_ENTITY_TYPES = [
  { key: "standard", title: "Limited Liability Partnership (LLP)", suffix: "LLP", form: "FiLLiP · Form 3", tags: ["Min 2 Partners", "Flexible Agreement"], pop: true },
];

// Fallback checklist when the admin hasn't configured document types.
const FALLBACK_DOCS = [
  "PAN & Aadhaar of designated partners",
  "Passport-size photographs",
  "Digital Signature Certificate (DSC)",
  "Address proof of registered office",
  "Rent agreement + NOC (if rented)",
  "LLP agreement draft",
  "Consent letters (Form 9)",
];

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "MCA FiLLiP Validations" },
  { icon: Zap, label: "Dynamic Fee Estimate" },
  { icon: ClipboardList, label: "LLP Checklist" },
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

export function LlpWizard({ initialName }: { initialName?: string }) {
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  // Entity type is fixed to the standard LLP — the selection step was removed.
  const [entity] = useState("standard");
  const [name1, setName1] = useState(initialName || "");
  const [name2, setName2] = useState("");
  const [state, setState] = useState("Telangana");
  const [partners, setPartners] = useState(2);
  const [capital, setCapital] = useState(100000);
  const [paidCapital, setPaidCapital] = useState(100000);
  const [objects, setObjects] = useState("");
  const [industryType, setIndustryType] = useState("");
  const [industryOther, setIndustryOther] = useState("");
  // The industry filed with the application — the free-text value when "Other".
  const effectiveIndustry = industryType === "Other" ? industryOther.trim() : industryType;
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
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

  const selected = LLP_ENTITY_TYPES.find((e) => e.key === entity) || LLP_ENTITY_TYPES[0];
  // Pricing & checklist come from the admin catalog's `llp` service.
  const { service, loading: catalogLoading } = useCatalogService(["llp"]);
  const { documents, fromCatalog: docsFromCatalog } = resolveDocuments(service, FALLBACK_DOCS);

  // Fees come from the backend fee engine (the single source of truth): the
  // FiLLiP schedule (filing fee by contribution + name reservation + PAN/TAN) +
  // professional fee + 18% GST. The same context is recomputed at submission.
  const feeContext: FeeContext = { kind: "llp", contribution: capital };
  const estimate = useFeeEstimate(feeContext, !!user);
  const fees: ResolvedFees = {
    lines: estimate.lines,
    total: estimate.total,
    fromCatalog: estimate.fromCatalog,
  };
  const total = estimate.total;

  const nameOk = useMemo(() => {
    if (!name1) return null;
    const len = name1.trim().length;
    const bad = /(India|National|Bharat|President|Bank)/i.test(name1);
    if (len < 3) return { ok: false, msg: "Minimum 3 characters" };
    if (bad) return { ok: false, msg: "Contains restricted keyword — needs Central Govt. approval" };
    return { ok: true, msg: "Preliminary check passed — reserve via RUN-LLP / FiLLiP" };
  }, [name1]);

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    if (currentStep === 0) {
      if (!name1.trim()) {
        newErrors.name1 = "Please enter Proposed Name 1.";
        globalMsg = "Proposed Name 1 is required.";
      } else if (name1.trim().length < 3) {
        newErrors.name1 = "Proposed Name 1 must be at least 3 characters long.";
        globalMsg = "Proposed Name 1 is too short.";
      }

      if (!objects.trim()) {
        newErrors.objects = "Please describe the main object / business activity of the LLP.";
        if (!globalMsg) globalMsg = "Main business activity is required.";
      }
    } else if (currentStep === 1) {
      if (partners < 2) {
        newErrors.partners = "LLP requires a minimum of 2 Designated Partners.";
        globalMsg = "Minimum 2 Designated Partners required.";
      }
    } else if (currentStep === 2) {
      if (!address.trim()) {
        newErrors.address = "Please enter registered office address.";
        globalMsg = "Registered office address is required.";
      }
      if (!state.trim()) {
        newErrors.state = "Please select state.";
        if (!globalMsg) globalMsg = "State is required.";
      }
      if (!city.trim()) {
        newErrors.city = "Please enter city.";
        if (!globalMsg) globalMsg = "City is required.";
      }
      if (!pincode.trim() || !/^[1-9][0-9]{5}$/.test(pincode.trim())) {
        newErrors.pincode = "Enter valid 6-digit Indian PIN Code.";
        if (!globalMsg) globalMsg = "Valid 6-digit PIN Code is required.";
      }
    } else if (currentStep === 3) {
      if (!capital || capital < 10000) {
        newErrors.capital = "Partner contribution must be at least ₹10,000.";
        globalMsg = "Contribution must be at least ₹10,000.";
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
          suffix: selected.suffix,
          form: selected.form,
          directors: partners,
          shareholders: partners,
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
      link.download = `LLP_Filing_Summary_${name1 ? name1.trim().replace(/\s+/g, "_") : "LLP"}.pdf`;
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
            MCA · LLP Act 2008 · FiLLiP Portal Desk
          </span>
          <h1 className="mt-4 text-4xl md:text-[42px] font-semibold font-display tracking-tight leading-[1.05]">
            LLP Registration <br />
            {/* <span className="text-primary">Incorporation Wizard</span> */}
          </h1>
          <p className="mt-3 text-white/70 max-w-2xl text-[15px] leading-relaxed">
            Guided Cloudcrest BM workspace for Limited Liability Partnership (LLP) incorporation,
            DPIN allocation, FiLLiP e-filing, and LLP Agreement drafting.
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
                LLP Registration · MCA / FiLLiP
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                LLP Incorporation Wizard
              </h2>
              
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
                <span className="font-semibold text-foreground">LLP Minimum Rules · </span>
                Minimum 2 Designated Partners required · At least 1 Designated Partner must be a resident of India.
              </div>
            </div>

            <div key={step} className="mt-8 animate-in-up">
              {step === 0 && (
                <Card>
                  <div className="space-y-6">
                    <Field label="Proposed LLP Name 1 *" error={errors.name1}>
                      <div className="flex gap-2">
                        <Input
                          value={name1}
                          onChange={(v) => { setName1(v); setErrors((prev) => ({ ...prev, name1: "" })); }}
                          placeholder="e.g. ZENIN TECH ADVISORS"
                          error={errors.name1}
                        />
                        <span className="mono text-xs text-muted-foreground self-center whitespace-nowrap">
                          {selected.suffix}
                        </span>
                      </div>
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
                          <span>{nameOk.msg}</span>
                        </div>
                      )}
                    </Field>

                    <Field label="Proposed LLP Name 2 (Optional)">
                      <div className="flex gap-2">
                        <Input
                          value={name2}
                          onChange={(v) => setName2(v)}
                          placeholder="e.g. ZENIN INNOVATION ADVISORS"
                        />
                        <span className="mono text-xs text-muted-foreground self-center whitespace-nowrap">
                          {selected.suffix}
                        </span>
                      </div>
                    </Field>

                    <Field label="Industry Type">
                      <select
                        value={industryType}
                        onChange={(e) => setIndustryType(e.target.value)}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus"
                      >
                        <option value="">Select industry type…</option>
                        {INDUSTRY_TYPES.map((i) => (
                          <option key={i} value={i}>{i}</option>
                        ))}
                      </select>
                      {industryType === "Other" && (
                        <input
                          value={industryOther}
                          onChange={(e) => setIndustryOther(e.target.value)}
                          placeholder="Please specify your industry"
                          className="mt-2 w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus"
                        />
                      )}
                    </Field>
                    <Field label="Main Objects / Business Activity *" error={errors.objects}>
                      <textarea
                        value={objects}
                        onChange={(e) => { setObjects(e.target.value); setErrors((prev) => ({ ...prev, objects: "" })); }}
                        rows={3}
                        className="w-full bg-input border border-border rounded-lg p-3 text-sm ring-focus"
                        placeholder="e.g. To carry on the business of technology consulting, software development and IT enabled services."
                      />
                    </Field>
                  </div>
                </Card>
              )}

              {step === 1 && (
                <Card>
                  <div className="space-y-6">
                    <Field label="Number of Designated Partners (Min 2) *" error={errors.partners}>
                      <NumberInput
                        value={partners}
                        onChange={(v) => setPartners(v)}
                        min={2}
                        max={50}
                        error={errors.partners}
                      />
                    </Field>
                  </div>
                </Card>
              )}

              {step === 2 && (
                <Card>
                  <div className="space-y-4">
                    <Field label="Registered Office Address *" error={errors.address}>
                      <Input
                        value={address}
                        onChange={(v) => setAddress(v)}
                        placeholder="Flat / Door / Block No., Street, Premises"
                        error={errors.address}
                      />
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Field label="State *" error={errors.state}>
                        <select
                          value={state}
                          onChange={(e) => { setState(e.target.value); setErrors((prev) => ({ ...prev, state: "" })); }}
                          className={
                            "w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " +
                            (errors.state ? "border-destructive focus:ring-destructive/25" : "border-border")
                          }
                        >
                          {INDIAN_STATES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="City *" error={errors.city}>
                        <Input value={city} onChange={(v) => setCity(v)} placeholder="e.g. Hyderabad" error={errors.city} />
                      </Field>
                      <Field label="PIN Code *" error={errors.pincode}>
                        <Input value={pincode} onChange={(v) => setPincode(v)} placeholder="e.g. 500081" error={errors.pincode} />
                      </Field>
                    </div>
                  </div>
                </Card>
              )}

              {step === 3 && (
                <Card>
                  <div className="space-y-6">
                    <Field label="Total Partner Contribution (INR) *" error={errors.capital}>
                      <NumberInput
                        value={capital}
                        onChange={(v) => { setCapital(v); setPaidCapital(v); }}
                        min={10000}
                        step={10000}
                        error={errors.capital}
                      />
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[100000, 500000, 1000000].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => { setCapital(c); setPaidCapital(c); }}
                          className={
                            "p-3 rounded-lg border text-left transition-all " +
                            (capital === c ? "border-primary bg-primary/5 font-bold" : "border-border bg-surface")
                          }
                        >
                          <div className="text-[10px] uppercase text-muted-foreground">Preset</div>
                          <div className="mono text-sm mt-1">₹ {c.toLocaleString("en-IN")}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {step === 4 && (
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
                    <h3 className="text-sm font-semibold">Estimated LLP Fee Breakdown</h3>
                  </div>
                  {estimate.loading ? (
                    <div className="text-xs text-muted-foreground py-4">Loading current pricing…</div>
                  ) : (
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
                      {!fees.fromCatalog && (
                        <p className="pt-2 text-[11px] text-muted-foreground">
                          Indicative pricing — confirmed by your advisor before payment.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                )
              )}

              {step === 5 && (
                <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary">LLP Application Preview</div>
                    <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning font-semibold">
                      READY TO SUBMIT
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Entity Type</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{selected.title}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Proposed Name 1</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{name1 ? `${name1} ${selected.suffix}` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Designated Partners</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{partners}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Partner Contribution</dt>
                      <dd className="font-semibold text-foreground mt-0.5">₹ {capital.toLocaleString("en-IN")}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Registered Office</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{address ? `${address}, ${city}, ${state} - ${pincode}` : "—"}</dd>
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

        {/* Right panel — current selection & documents */}
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
                MCA FiLLiP portal.
              </div>
            </div>
          </div>
        </aside>
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="llp"
        serviceTitle={`LLP Registration — ${selected.title}`}
        authority="MCA"
        form={selected.form}
        initialEmail={applicantEmail}
        initialPhone={applicantPhone}
        capital={capital}
        paidCapital={paidCapital}
        formData={{
          name1,
          name2,
          suffix: selected.suffix,
          objects,
          ...(effectiveIndustry ? { industryType: effectiveIndustry } : {}),
          address,
          city,
          state,
          pincode,
          directors: partners,
          partnersCount: partners,
          capital,
          paidCapital,
        }}
        documents={documents}
        fees={fees.lines}
        feeTotal={fees.total}
        feeContext={feeContext}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your LLP incorporation — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/llp"
      />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6">
      {children}
    </div>
  );
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

function Input({ value, onChange, placeholder, error }: { value: string; onChange: (v: string) => void; placeholder?: string; error?: string }) {
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

function NumberInput({ value, onChange, min = 0, max, step = 1, error }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; error?: string }) {
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
