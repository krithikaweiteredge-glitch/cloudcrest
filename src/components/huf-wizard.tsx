import { useState, useEffect, useMemo } from "react";
import { EntityStateWizard } from "@/components/entity-state-wizard";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useAuth } from "@/hooks/use-auth";
import { resolveFees, useCatalogService, type CatalogService, type ResolvedFees } from "@/lib/service-catalog";
import { INDIAN_STATES } from "@/lib/form-options";
import {
  ShieldCheck,
  ScrollText,
  FileDown,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Send,
  Download,
  Lock,
  CheckCircle2,
  Sparkles,
  Landmark,
  FileText,
} from "lucide-react";

/**
 * HUF (Hindu Undivided Family) Registration Flow
 * Source document: "HUF Registration flow.docx"
 *
 * Tab 1 — Basic Details
 *  - Name of the HUF
 *  - Applicant (Karta) Mobile
 *  - Applicant (Karta) Email
 *
 * Tab 2 — HUF Structure
 *  - Name of Karta
 *  - Number of Coparceners / Members
 *  - Registered Address of the HUF (Address, State, City, PIN Code)
 *
 * Tab 3 — Nature & Details
 *  - Nature of HUF Activities (Business / Trading, Profession, Investment / Holding of Assets, Agricultural, Mixed, Other)
 *  - Source of HUF Corpus / Property (Ancestral Property, Gift, Will / Inheritance, Self-acquired thrown into hotchpot, Other)
 *  - Brief Description of HUF Activities / Objects
 *
 * Tab 4 — Fee Breakdown
 * Tab 5 — Summary & Submission
 */

const HUF_STEPS = [
  { key: "basic", label: "Basic Details" },
  { key: "structure", label: "HUF Structure" },
  { key: "nature", label: "Nature & Details" },
  { key: "fees", label: "Fee Breakdown" },
  { key: "summary", label: "Summary" },
];

const HUF_NATURE_ACTIVITIES = [
  "Business / Trading",
  "Profession",
  "Investment / Holding of Assets",
  "Agricultural",
  "Mixed (Business + Investment)",
  "Other",
];

const HUF_CORPUS_SOURCES = [
  "Ancestral Property",
  "Gift",
  "Will / Inheritance",
  "Self-acquired property thrown into common hotchpot",
  "Other",
];

const HUF_DELIVERABLES = [
  "HUF Deed / Declaration executed on Stamp Paper",
  "HUF PAN Card Application Assistance",
  "Bank Account Resolution & Opening Assistance",
  "Income Tax Registration Guidance",
  "Coparcener & Member Declaration Format",
];

const HUF_DOCUMENTS = [
  "PAN & Aadhaar Card of Karta",
  "Identity & Address Proof of Coparceners / Family Members",
  "Proof of HUF Registered Address (Utility bill / Rent Agreement / NOC)",
  "Declaration / Deed of HUF Creation",
  "Source of Corpus Proof (Gift Deed / Will / Ancestral Asset Record)",
  "Passport-size Photograph of Karta",
];

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Recognised Separate IT Entity" },
  { icon: ScrollText, label: "HUF Deed on Stamp Paper" },
  { icon: Landmark, label: "Dedicated HUF PAN & Bank A/C" },
  { icon: FileDown, label: "Instant Summary PDF" },
];

const inr = (n: number) => `₹ ${n.toLocaleString("en-IN")}`;

function format10DigitPhone(phoneStr?: string | null): string {
  if (!phoneStr) return "";
  let cleaned = phoneStr.trim();
  if (cleaned.startsWith("+91")) cleaned = cleaned.slice(3);
  else if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(2);
  cleaned = cleaned.replace(/\D/g, "");
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
}

export function HufWizard({
  initialName,
  slug: _slug,
}: {
  initialName?: string;
  slug?: string;
}) {
  return (
    <EntityStateWizard
      config={{
        baseSlug: "huf",
        baseTitle: "HUF Registration",
        initialName,
        changeLabel: "Change state",
        hero: {
          eyebrow: "Income Tax · Hindu Undivided Family",
          title: "HUF Registration",
          subtitle:
            "Register a Hindu Undivided Family. Choose your state to open a full guide — who can apply, the documents you'll need and the fee — before you apply.",
          highlights: HIGHLIGHTS,
        },
        stateStep: {
          subtitle: "HUF registration is handled state-wise.",
        },
        renderWizard: ({ state, service, onBack, initialName }) => (
          <HufStepperWizard
            state={state}
            service={service}
            onExit={onBack}
            initialName={initialName}
          />
        ),
      }}
    />
  );
}

export function HufStepperWizard({
  state,
  service,
  onExit,
  initialName = "",
}: {
  state: string;
  service: CatalogService;
  onExit: () => void;
  initialName?: string;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Tab 1: Basic Details
  const [hufName, setHufName] = useState(initialName);
  const [applicantMobile, setApplicantMobile] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");

  // Tab 2: HUF Structure
  const [kartaName, setKartaName] = useState("");
  const [membersCount, setMembersCount] = useState("2");
  const [registeredAddress, setRegisteredAddress] = useState("");
  const [officeState, setOfficeState] = useState(state || "Telangana");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");

  // Tab 3: Nature & Details
  const [natureOfActivities, setNatureOfActivities] = useState(HUF_NATURE_ACTIVITIES[0]);
  const [corpusSource, setCorpusSource] = useState(HUF_CORPUS_SOURCES[0]);
  const [briefDescription, setBriefDescription] = useState("");

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  // Dynamic fee resolution from catalog
  const stateSlug =
    REGISTRATION_STATES.find((s) => s.name === officeState)?.slug ||
    state?.toLowerCase().replace(/\s+/g, "-");
  const slugChain = stateSlug ? [`huf-${stateSlug}`, "huf"] : ["huf"];
  const { service: dynamicService, loading: _catalogLoading } = useCatalogService(slugChain);
  const activeService = dynamicService || service;

  const authority = "Income Tax Department / Sub-Registrar";
  const fees: ResolvedFees = useMemo(() => {
    return resolveFees(activeService, authority, {
      professional: 2999,
      govt: 0,
      gstPercent: 18,
    });
  }, [activeService, authority]);

  const total = fees.total;
  const professionalFee =
    typeof activeService?.professionalFee === "number" && activeService.professionalFee > 0
      ? activeService.professionalFee
      : fees.lines.find((l) => l.label.toLowerCase() === "professional fee")?.amount ||
        fees.lines.find((l) => l.label.toLowerCase().startsWith("professional"))?.amount ||
        2999;

  // Sync state
  useEffect(() => {
    if (state) setOfficeState(state);
  }, [state]);

  // Sync Karta name to HUF Name if empty
  useEffect(() => {
    if (kartaName.trim() && !hufName.trim()) {
      setHufName(`${kartaName.trim().toUpperCase()} HUF`);
    }
  }, [kartaName]);

  // Prefill from user profile
  useEffect(() => {
    if (!user) return;
    setApplicantEmail((prev) => prev || user.email || "");
    setApplicantMobile((prev) => prev || format10DigitPhone(user.phone));

    fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/profiles/me`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setApplicantEmail((prev) => prev || data.user.email || user.email || "");
          setApplicantMobile((prev) => prev || format10DigitPhone(data.user.phone || user.phone));
        }
      })
      .catch((err) => console.error("Error prefilling profile:", err));
  }, [user]);

  const stepKey = HUF_STEPS[step]?.key;

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    const fail = (field: string, msg: string) => {
      newErrors[field] = msg;
      if (!globalMsg) globalMsg = msg;
    };

    if (currentStep === 0) {
      if (!hufName.trim()) fail("hufName", "Please enter the name of the HUF.");
      if (!applicantMobile.trim()) {
        fail("applicantMobile", "Enter applicant (Karta) mobile number.");
      } else if (!/^[6-9]\d{9}$/.test(applicantMobile.trim())) {
        fail("applicantMobile", "Enter a valid 10-digit Indian mobile number.");
      }
      if (applicantEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail.trim())) {
        fail("applicantEmail", "Enter a valid email address.");
      }
    } else if (currentStep === 1) {
      if (!kartaName.trim()) {
        fail("kartaName", "Enter full name of the Karta.");
      }
      if (!membersCount || Number(membersCount) <= 0) {
        fail("membersCount", "Enter number of coparceners / members.");
      }
      if (!registeredAddress.trim()) {
        fail("registeredAddress", "Enter registered office address.");
      }
      if (!officeState.trim()) {
        fail("officeState", "Select state.");
      }
      if (!city.trim()) {
        fail("city", "Enter city.");
      }
      if (!pincode.trim()) {
        fail("pincode", "Enter PIN code.");
      } else if (!/^\d{6}$/.test(pincode.trim())) {
        fail("pincode", "Enter a valid 6-digit PIN code.");
      }
    } else if (currentStep === 2) {
      if (!natureOfActivities.trim()) {
        fail("natureOfActivities", "Please select nature of HUF activities.");
      }
      if (!corpusSource.trim()) {
        fail("corpusSource", "Please select source of HUF corpus / property.");
      }
    }

    setErrors(newErrors);
    setStepError(globalMsg);
    return Object.keys(newErrors).length === 0 && !globalMsg;
  };

  const next = () => {
    if (step > 0 && !user) {
      setOpenSignIn(true);
      return;
    }
    if (validateStep(step)) {
      setStep((s) => Math.min(HUF_STEPS.length - 1, s + 1));
      setStepError(null);
      setErrors({});
    }
  };

  const back = () => {
    if (step === 0) {
      onExit();
      return;
    }
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

  const fullAddress = [registeredAddress, city, officeState || state, pincode ? `- ${pincode}` : ""]
    .filter(Boolean)
    .join(", ")
    .replace(", - ", " - ");

  const downloadSummaryPdf = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/summary/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `HUF Registration — ${hufName || "Hindu Undivided Family"}`,
          name1: hufName,
          suffix: "HUF",
          form: "HUF Deed & PAN",
          address: fullAddress,
          city,
          state: officeState || state,
          pincode,
          objects: `Karta: ${kartaName}\nMembers: ${membersCount}\nNature of Activities: ${natureOfActivities}\nSource of Corpus: ${corpusSource}\nDescription: ${briefDescription || "—"}`,
          fees: fees.lines,
          total,
          authority,
          documents: HUF_DOCUMENTS,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate PDF summary");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const fileName = `HUF_Registration_Summary_${hufName ? hufName.trim().replace(/\s+/g, "_") : "HUF"}.pdf`;
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
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Main Content Area */}
        <main className="flex-1 px-4 sm:px-8 py-8 max-w-4xl mx-auto w-full">
          <button
            type="button"
            onClick={back}
            className="group mb-6 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            <span>{step === 0 ? "Back to State Selection" : "Previous Step"}</span>
          </button>

          <div className="mb-6">
            <div className="label-eyebrow mb-2 text-primary">
              HUF Registration · {officeState || state}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              HUF Registration Wizard
            </h2>
          </div>

          <div className="rounded-xl border border-border bg-surface shadow-card p-4">
            <Stepper steps={HUF_STEPS} current={step} onGo={handleStepChange} />
          </div>

          {stepError && (
            <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 flex items-center gap-2.5 text-xs text-destructive animate-in fade-in-50">
              <AlertTriangle className="size-4 shrink-0" />
              <span className="font-semibold">{stepError}</span>
            </div>
          )}

          <div key={step} className="mt-8 animate-in-up">
            {/* STEP 1: Basic Details */}
            {stepKey === "basic" && (
              <Card>
                <div className="space-y-6">
                  <Field label="Name of the HUF *" error={errors.hufName}>
                    <Input
                      value={hufName}
                      onChange={(v) => {
                        setHufName(v);
                        setErrors((prev) => ({ ...prev, hufName: "" }));
                      }}
                      placeholder="e.g. RAMESH CHANDRA SHARMA HUF"
                      error={errors.hufName}
                    />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Applicant (Karta) Mobile *" error={errors.applicantMobile}>
                      <Input
                        value={applicantMobile}
                        onChange={(v) => {
                          setApplicantMobile(format10DigitPhone(v));
                          setErrors((prev) => ({ ...prev, applicantMobile: "" }));
                        }}
                        placeholder="9876543210"
                        error={errors.applicantMobile}
                      />
                    </Field>

                    <Field label="Applicant (Karta) Email" error={errors.applicantEmail}>
                      <Input
                        value={applicantEmail}
                        onChange={(v) => {
                          setApplicantEmail(v);
                          setErrors((prev) => ({ ...prev, applicantEmail: "" }));
                        }}
                        placeholder="karta@example.com"
                        error={errors.applicantEmail}
                      />
                    </Field>
                  </div>
                </div>
              </Card>
            )}

            {/* STEP 2: HUF Structure */}
            {stepKey === "structure" && (
              <Card>
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Name of Karta *" error={errors.kartaName}>
                      <Input
                        value={kartaName}
                        onChange={(v) => {
                          setKartaName(v);
                          setErrors((prev) => ({ ...prev, kartaName: "" }));
                        }}
                        placeholder="Full name as per PAN / Aadhaar"
                        error={errors.kartaName}
                      />
                    </Field>

                    <Field
                      label="Number of Coparceners / Members *"
                      error={errors.membersCount}
                    >
                      <Input
                        value={membersCount}
                        onChange={(v) => {
                          setMembersCount(v.replace(/\D/g, ""));
                          setErrors((prev) => ({ ...prev, membersCount: "" }));
                        }}
                        placeholder="e.g. 2"
                        error={errors.membersCount}
                      />
                    </Field>
                  </div>

                  <Field label="Registered Office Address of the HUF *" error={errors.registeredAddress}>
                    <textarea
                      rows={2}
                      value={registeredAddress}
                      onChange={(e) => {
                        setRegisteredAddress(e.target.value);
                        setErrors((prev) => ({ ...prev, registeredAddress: "" }));
                      }}
                      placeholder="Door / Flat No., Building Name, Street / Road, Area / Locality"
                      className={
                        "w-full bg-input border rounded-lg px-3.5 py-2 text-sm ring-focus transition-shadow " +
                        (errors.registeredAddress ? "border-destructive focus:ring-destructive/25" : "border-border")
                      }
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="State *" error={errors.officeState}>
                      <select
                        value={officeState}
                        onChange={(e) => {
                          setOfficeState(e.target.value);
                          setErrors((prev) => ({ ...prev, officeState: "" }));
                        }}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow"
                      >
                        {INDIAN_STATES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="City *" error={errors.city}>
                      <Input
                        value={city}
                        onChange={(v) => {
                          setCity(v);
                          setErrors((prev) => ({ ...prev, city: "" }));
                        }}
                        placeholder="e.g. Hyderabad"
                        error={errors.city}
                      />
                    </Field>

                    <Field label="PIN Code *" error={errors.pincode}>
                      <Input
                        value={pincode}
                        onChange={(v) => {
                          setPincode(v.replace(/\D/g, "").slice(0, 6));
                          setErrors((prev) => ({ ...prev, pincode: "" }));
                        }}
                        placeholder="e.g. 500081"
                        error={errors.pincode}
                      />
                    </Field>
                  </div>
                </div>
              </Card>
            )}

            {/* STEP 3: Nature & Details */}
            {stepKey === "nature" && (
              <Card>
                <div className="space-y-6">
                  <Field label="Nature of HUF Activities *" error={errors.natureOfActivities}>
                    <select
                      value={natureOfActivities}
                      onChange={(e) => {
                        setNatureOfActivities(e.target.value);
                        setErrors((prev) => ({ ...prev, natureOfActivities: "" }));
                      }}
                      className={
                        "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
                        (errors.natureOfActivities ? "border-destructive focus:ring-destructive/25" : "border-border")
                      }
                    >
                      {HUF_NATURE_ACTIVITIES.map((act) => (
                        <option key={act} value={act}>
                          {act}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Source of HUF Corpus / Property *" error={errors.corpusSource}>
                    <select
                      value={corpusSource}
                      onChange={(e) => {
                        setCorpusSource(e.target.value);
                        setErrors((prev) => ({ ...prev, corpusSource: "" }));
                      }}
                      className={
                        "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
                        (errors.corpusSource ? "border-destructive focus:ring-destructive/25" : "border-border")
                      }
                    >
                      {HUF_CORPUS_SOURCES.map((src) => (
                        <option key={src} value={src}>
                          {src}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Brief Description of HUF Activities / Objects">
                    <textarea
                      rows={4}
                      value={briefDescription}
                      onChange={(e) => setBriefDescription(e.target.value)}
                      placeholder="Describe primary family business, asset investments, or rental activities intended under the HUF..."
                      className="w-full bg-input border border-border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow"
                    />
                  </Field>
                </div>
              </Card>
            )}

            {/* STEP 4: Fee Breakdown */}
            {stepKey === "fees" && (
              <FeeBreakdown
                fees={fees}
                total={total}
                user={!!user}
                onSignIn={() => setOpenSignIn(true)}
              />
            )}

            {/* STEP 5: Summary */}
            {stepKey === "summary" && (
              <div className="space-y-6">
                <SummaryPreview
                  hufName={hufName}
                  kartaName={kartaName}
                  membersCount={membersCount}
                  natureOfActivities={natureOfActivities}
                  corpusSource={corpusSource}
                  briefDescription={briefDescription}
                  address={fullAddress}
                  fees={fees}
                />
              </div>
            )}
          </div>

          {/* Nav buttons */}
          <div className="mt-8 flex items-center justify-between pt-4 border-t border-border">
            <button
              type="button"
              onClick={back}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-xs font-semibold hover:bg-surface transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back</span>
            </button>

            {step < HUF_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm"
              >
                <span>Continue</span>
                <ArrowRight className="size-4" />
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={downloadSummaryPdf}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-xs font-semibold hover:bg-surface transition-colors"
                >
                  <Download className="size-4" />
                  <span>Download Summary PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      setOpenSignIn(true);
                      return;
                    }
                    setOpenReg(true);
                  }}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm"
                >
                  <Send className="size-4" />
                  <span>Submit Application</span>
                </button>
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar Checklist */}
        <aside className="hidden lg:block w-80 border-l border-border bg-surface">
          <div className="sticky top-16 p-6 space-y-6">
            <div>
              <div className="label-eyebrow mb-2.5 text-primary">Current Selection</div>
              <div className="rounded-lg border border-border bg-panel p-3.5 space-y-3">
                <div>
                  <div className="text-[11px] text-muted-foreground font-medium">Entity Type</div>
                  <div className="text-sm font-semibold text-foreground mt-0.5">
                    HUF Registration
                  </div>
                </div>

                <div className="pt-2.5 border-t border-border/60">
                  <div className="text-[11px] text-muted-foreground font-medium">State</div>
                  <div className="text-xs font-semibold text-foreground mt-0.5">{officeState || state}</div>
                </div>

                {hufName && (
                  <div className="pt-2.5 border-t border-border/60">
                    <div className="text-[11px] text-muted-foreground font-medium">HUF Name</div>
                    <div className="text-xs font-semibold text-foreground mt-0.5 truncate">{hufName}</div>
                  </div>
                )}

                {kartaName && (
                  <div className="pt-2.5 border-t border-border/60">
                    <div className="text-[11px] text-muted-foreground font-medium">Karta Name</div>
                    <div className="text-xs font-semibold text-foreground mt-0.5 truncate">{kartaName}</div>
                  </div>
                )}

                {professionalFee > 0 && (
                  <div className="pt-2.5 border-t border-border/60">
                    <div className="text-[11px] text-muted-foreground font-medium">Professional Fee</div>
                    <div className="text-xs font-semibold mono text-primary mt-0.5">
                      ₹{professionalFee.toLocaleString("en-IN")} + 18% GST
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border/80 bg-panel/30 p-3.5 space-y-1.5">
              <div className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="size-3.5 text-primary" />
                <span>Separate Tax Entity</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                An HUF is assessed as a distinct legal person under Section 2(31) of the Income Tax Act, 1961 with separate basic exemption slabs and deductions.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Submit Application Modal (RegisterDialog) */}
      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug={activeService.slug || "huf"}
        serviceTitle={`HUF Registration — ${officeState || state}`}
        authority={authority}
        form="HUF Deed & PAN"
        documents={HUF_DOCUMENTS}
        initialEmail={applicantEmail}
        initialPhone={applicantMobile}
        formData={{
          hufName,
          name1: hufName,
          kartaName,
          applicantMobile,
          applicantEmail,
          membersCount,
          address: fullAddress,
          registeredAddress,
          city,
          pincode,
          state: officeState || state,
          natureOfActivities,
          corpusSource,
          briefDescription,
        }}
        fees={fees.lines}
        feeTotal={total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to view fee breakdown and submit your HUF registration."
        next={`/m/${service.slug}`}
      />
    </div>
  );
}

const REGISTRATION_STATES = [
  { name: "Telangana", slug: "telangana" },
  { name: "Andhra Pradesh", slug: "andhra-pradesh" },
  { name: "Karnataka", slug: "karnataka" },
];

/* ── Form Components ── */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-5">
      {children}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-foreground/90">{label}</label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={
        "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
        (error ? "border-destructive focus:ring-destructive/25" : "border-border")
      }
    />
  );
}

function NumberInput({
  value,
  min = 1,
  max = 50,
  onChange,
  error,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, Number(value || min) - 1))}
        disabled={value <= min}
        className="size-9 rounded-lg border border-border bg-input font-bold text-sm hover:bg-surface disabled:opacity-40 transition-colors"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const val = parseInt(e.target.value, 10);
          if (!isNaN(val)) onChange(Math.max(min, Math.min(max, val)));
        }}
        className={
          "w-20 text-center bg-input border rounded-lg px-2 py-2 text-sm font-semibold mono ring-focus transition-shadow " +
          (error ? "border-destructive" : "border-border")
        }
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, Number(value || min) + 1))}
        disabled={value >= max}
        className="size-9 rounded-lg border border-border bg-input font-bold text-sm hover:bg-surface disabled:opacity-40 transition-colors"
      >
        +
      </button>
    </div>
  );
}

function FeeBreakdown({
  fees,
  total,
  user,
  onSignIn,
}: {
  fees: ResolvedFees;
  total: number;
  user: boolean;
  onSignIn: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Estimated HUF Registration Fee Breakdown</h3>
      </div>

      <FeeStack lines={fees.lines} total={total} />

      {!user && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 flex items-center justify-between gap-4 mt-4">
          <div className="flex items-center gap-3">
            <Lock className="size-4 text-warning shrink-0" />
            <span className="text-xs text-foreground/80">
              Sign in to unlock one-click application submission and real-time filing tracking.
            </span>
          </div>
          <button
            type="button"
            onClick={onSignIn}
            className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 shrink-0"
          >
            Sign In
          </button>
        </div>
      )}
    </div>
  );
}

function FeeStack({
  lines,
  total,
}: {
  lines: Array<{ label: string; amount: number; hint?: string }>;
  total: number;
}) {
  return (
    <div className="space-y-2.5">
      {lines.map((l) => (
        <div key={l.label} className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">{l.label}</span>
          <span className="mono text-foreground">{inr(l.amount)}</span>
        </div>
      ))}
      <div className="pt-3 mt-2 border-t border-border flex justify-between items-baseline">
        <span className="text-xs font-semibold">Total Estimate</span>
        <span className="mono text-2xl font-semibold text-primary">{inr(total)}</span>
      </div>
    </div>
  );
}

function SummaryPreview({
  hufName,
  kartaName,
  membersCount,
  natureOfActivities,
  corpusSource,
  briefDescription,
  address,
  fees,
}: {
  hufName: string;
  kartaName: string;
  membersCount: string | number;
  natureOfActivities: string;
  corpusSource: string;
  briefDescription?: string;
  address: string;
  fees: ResolvedFees;
}) {
  const rows = [
    ["Entity Type", "Hindu Undivided Family (HUF)"],
    ["Name of the HUF", hufName || "—"],
    ["Name of Karta", kartaName || "—"],
    ["Coparceners / Members", `${membersCount} Members`],
    ["Nature of Activities", natureOfActivities || "—"],
    ["Source of Corpus", corpusSource || "—"],
    ["Registered Office", address || "—"],
    ...(briefDescription ? [["Description / Objects", briefDescription]] : []),
  ];

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="label-eyebrow text-primary">Application Summary · Draft</div>
        <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning font-semibold">
          NOT SUBMITTED
        </span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between items-baseline border-b border-border pb-2.5">
            <dt className="text-[11px] text-muted-foreground uppercase tracking-wider">{k}</dt>
            <dd className="text-sm font-semibold text-foreground text-right max-w-[60%] truncate">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 pt-3 border-t border-border flex justify-between items-baseline">
        <span className="text-xs font-semibold">Total Estimated Cost</span>
        <span className="mono text-2xl font-semibold text-primary">{inr(fees.total)}</span>
      </div>
    </div>
  );
}
