import { useMemo, useState, useEffect } from "react";
import { EntityStateWizard, REGISTRATION_STATES, type StateWizardType } from "@/components/entity-state-wizard";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useCatalogService, resolveFees, type CatalogService, type ResolvedFees } from "@/lib/service-catalog";
import { INDIAN_STATES } from "@/lib/form-options";
import {
  AlertTriangle, Download, ArrowLeft, ArrowRight, CheckCircle2,
  FileText, Info, ShieldCheck, Zap, ClipboardList, FileDown, Send, Lock,
  Award, Users, Building
} from "lucide-react";
import { blockNegativeKeys, nonNegative } from "@/lib/number-input";

const SOCIETY_STEPS = [
  { key: "basic", label: "Basic Details" },
  { key: "structure", label: "Structure & Members" },
  { key: "nature", label: "Nature & Objects" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const SOCIETY_TYPES: StateWizardType[] = [
  {
    key: "general",
    slug: "society-general",
    title: "General Society / Association",
    note: "Registered under the Societies Registration Act, 1860 for charitable, educational, literary, cultural, sports or public welfare purposes.",
    icon: Award,
    recommended: true,
  },
  {
    key: "macs",
    slug: "society-macs",
    title: "Mutually Aided Co-operative Society (MACS)",
    note: "Ideal for Apartment / Flat Owners Associations, Housing societies, and resident welfare associations with autonomous member management.",
    icon: Building,
  },
  {
    key: "coop",
    slug: "society-coop",
    title: "Co-operative Society",
    note: "Formed under state Co-operative Societies Act to promote economic interests — Credit & Thrift, Housing, Consumer, Dairy or Multi-purpose.",
    icon: Users,
  },
];

const SOCIETY_ACTIVITIES_BY_TYPE: Record<string, string[]> = {
  general: [
    "Charitable",
    "Educational",
    "Cultural / Literary",
    "Sports",
    "Religious",
    "Scientific",
    "Social Welfare",
    "Fine Arts",
    "Other Public Purpose",
  ],
  macs: [
    "Apartment / Flat Owners Association",
    "Housing",
    "Residential Welfare",
    "Other Mutually Aided Activity",
  ],
  coop: [
    "Credit / Thrift",
    "Housing",
    "Consumer",
    "Dairy / Milk",
    "Agricultural / Marketing",
    "Industrial / Weavers",
    "Transport",
    "Labour",
    "Multi-purpose",
    "Other Co-operative Activity",
  ],
};

const SOCIETY_CERTIFICATES = [
  "Certificate of Registration (Registrar of Societies / Co-ops)",
  "Certified Memorandum of Association (MoA)",
  "Certified Rules & Regulations / Byelaws",
  "Executive Committee & Member List Filing",
  "Society PAN Card",
  "Society TAN",
  "12A & 80G Registration Guidance (for Charitable Societies)",
  "Bank Account Opening Resolution Draft",
];

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Societies Registration Act" },
  { icon: FileText, label: "MoA & Byelaws Drafting" },
  { icon: Users, label: "Executive Committee Filing" },
  { icon: FileDown, label: "Downloadable Summary" },
];

const DOCS_GENERAL = [
  "PAN & Aadhaar of all Executive Committee Members",
  "Passport-size photographs of President & General Secretary",
  "Memorandum of Association (MoA) & Byelaws on stamp paper",
  "Proof of Registered Office Address (Electricity bill / Property tax receipt)",
  "Rent Agreement & NOC from property owner (if rented)",
  "Affidavit and consent letters from all promoters / committee members",
  "Resolution passed in founding general body meeting",
];

const DOCS_MACS = [
  "PAN & Aadhaar of all promoter members / flat owners",
  "Photographs of Executive Committee office bearers",
  "Bye-laws of the Mutually Aided Co-operative Society (MACS)",
  "Proof of registered office / Apartment complex premises address",
  "List of members with flat / unit numbers and share contribution",
  "Meeting resolution electing initial board of directors",
];

const DOCS_COOP = [
  "PAN & Aadhaar of all founding members (min 10)",
  "Photographs of Managing Committee members",
  "Proposed Bye-laws adopted by general body",
  "Initial share capital / thrift deposit proof",
  "Registered office proof & NOC",
  "Feasibility report / project proposal (if applicable)",
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

export function SocietyWizard({
  initialName,
  slug,
}: {
  initialName?: string;
  slug?: string;
}) {
  const initialTypeKey = slug?.includes("macs")
    ? "macs"
    : slug?.includes("coop")
      ? "coop"
      : slug?.includes("general")
        ? "general"
        : undefined;

  return (
    <EntityStateWizard
      config={{
        baseSlug: "society",
        baseTitle: "Society Registration",
        typeFormDataKey: "societyType",
        types: SOCIETY_TYPES,
        initialTypeKey,
        initialName,
        changeLabel: "Change type / state",
        hero: {
          eyebrow: "District Registrar · Societies Registration Act",
          title: "Society Registration",
          subtitle:
            "Register a General Society, Mutually Aided Cooperative (MACS) or Cooperative Society in your state. Review who can apply, document checklists and statutory fees.",
          highlights: [
            { icon: ShieldCheck, label: "Societies Registration Act" },
            { icon: FileText, label: "MoA & Rules Drafting" },
            { icon: Users, label: "Executive Committee Setup" },
            { icon: FileDown, label: "Tracked State Filing" },
          ],
        },
        typeStep: {
          eyebrow: "Step 1 · Structure",
          heading: "Choose a society type",
          subtitle: "Pick general non-profit society, MACS or cooperative structure.",
        },
        stateStep: {
          subtitle: "Society registration is handled state-wise by District Registrars.",
        },
        renderWizard: ({ type, state, service, onBack, initialName: passedName }) => (
          <SocietyStepperWizard
            type={type}
            state={state}
            service={service}
            onBack={onBack}
            initialName={passedName}
          />
        ),
      }}
    />
  );
}

/**
 * Society Stepper Wizard styled exactly like CompanyWizard.
 */
export function SocietyStepperWizard({
  type,
  state,
  service,
  onBack: onExit,
  initialName,
}: {
  type: StateWizardType | null;
  state: string;
  service: CatalogService;
  onBack: () => void;
  initialName?: string;
}) {
  const { user } = useAuth();
  const isGeneralSociety = type?.key === "general";
  const isMacs = type?.key === "macs";

  const [step, setStep] = useState(0);

  // Tab 1: Basic Details
  const [societyName, setSocietyName] = useState(initialName || "");
  const [applicantMobile, setApplicantMobile] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");

  // Tab 2: Structure & Members
  const [membersCount, setMembersCount] = useState(isGeneralSociety ? "7" : "10");
  const [committeeCount, setCommitteeCount] = useState(isMacs ? "3" : isGeneralSociety ? "3" : "5");
  const [registeredAddress, setRegisteredAddress] = useState("");
  const [officeState, setOfficeState] = useState(state || "Telangana");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");

  // Tab 3: Nature & Objects
  const availableActivities = useMemo(() => {
    return (type?.key && SOCIETY_ACTIVITIES_BY_TYPE[type.key]) || SOCIETY_ACTIVITIES_BY_TYPE.general;
  }, [type?.key]);

  const [selectedActivity, setSelectedActivity] = useState<string>(availableActivities[0] || "Charitable");
  const [societyObjects, setSocietyObjects] = useState("");

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  // Dynamic fee resolution from catalog
  const stateSlug =
    REGISTRATION_STATES.find((s) => s.name === officeState)?.slug ||
    state?.toLowerCase().replace(/\s+/g, "-");
  const typeSlug = type?.slug || (isGeneralSociety ? "society-general" : isMacs ? "society-macs" : "society-coop");
  const slugChain = stateSlug ? [`${typeSlug}-${stateSlug}`, typeSlug, "society"] : [typeSlug, "society"];
  const { service: dynamicService, loading: catalogLoading } = useCatalogService(slugChain);
  const activeService = dynamicService || service;

  const authority = isGeneralSociety ? "District Registrar of Societies" : "Registrar of Co-operatives";
  const fees: ResolvedFees = useMemo(() => {
    return resolveFees(activeService, authority, {
      professional: 5999,
      govt: 0,
      gstPercent: 18,
    });
  }, [activeService, authority]);

  const total = fees.total;
  const professionalFee =
    fees.lines.find((l) => l.label.toLowerCase() === "professional fee")?.amount ||
    fees.lines.find((l) => l.label.toLowerCase().startsWith("professional"))?.amount ||
    fees.lines.find((l) => l.label.toLowerCase().includes("professional"))?.amount ||
    (typeof activeService?.professionalFee === "number" && activeService.professionalFee > 0
      ? activeService.professionalFee
      : 5999);

  // Sync state
  useEffect(() => {
    if (state) setOfficeState(state);
  }, [state]);

  // Adjust activity default on type change
  useEffect(() => {
    if (!availableActivities.includes(selectedActivity)) {
      setSelectedActivity(availableActivities[0] || "");
    }
  }, [availableActivities]);

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

  const stepKey = SOCIETY_STEPS[step]?.key;

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    const fail = (field: string, msg: string) => {
      newErrors[field] = msg;
      if (!globalMsg) globalMsg = msg;
    };

    if (currentStep === 0) {
      if (!societyName.trim()) fail("societyName", "Please enter the proposed name of the Society.");
      if (!applicantMobile.trim()) {
        fail("applicantMobile", "Enter applicant mobile number.");
      } else if (!/^[6-9]\d{9}$/.test(applicantMobile.trim())) {
        fail("applicantMobile", "Enter a valid 10-digit Indian mobile number.");
      }
      if (applicantEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail.trim())) {
        fail("applicantEmail", "Enter a valid email address.");
      }
    } else if (currentStep === 1) {
      if (!membersCount || Number(membersCount) <= 0) {
        fail("membersCount", "Enter total number of members.");
      }
      if (!committeeCount || Number(committeeCount) <= 0) {
        fail("committeeCount", "Enter number of executive committee members.");
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
      if (!selectedActivity.trim()) {
        fail("activity", "Please select category/nature of society.");
      }
      if (!societyObjects.trim()) {
        fail("societyObjects", "Please describe the main objects of the society.");
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
      setStep((s) => Math.min(SOCIETY_STEPS.length - 1, s + 1));
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

  const fullAddress = [registeredAddress, city, officeState || state, pincode].filter(Boolean).join(", ");
  const currentDocs = isMacs ? DOCS_MACS : type?.key === "coop" ? DOCS_COOP : DOCS_GENERAL;

  const downloadSummaryPdf = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/summary/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Society Registration — ${type?.title || "Society"}`,
          name1: societyName,
          suffix: "Society",
          form: isGeneralSociety ? "Form A" : isMacs ? "Form I" : "Form 1",
          members: Number(membersCount) || 7,
          address: fullAddress,
          city,
          state: officeState || state,
          pincode,
          objects: `Category: ${selectedActivity}\nObjects: ${societyObjects}`,
          fees: fees.lines,
          total,
          authority,
          documents: currentDocs,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate PDF summary");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const fileName = `Society_Filing_Summary_${societyName ? societyName.trim().replace(/\s+/g, "_") : "Society"}.pdf`;
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
    <div className="flex">
      {/* Main Center Form matching CompanyWizard */}
      <div className="flex-1 min-w-0">
        <div className="max-w-3xl mx-auto px-10 py-8 animate-in-up">
          <div className="mb-6">
            <div className="label-eyebrow mb-2 text-primary">
              {type?.title || "Society Registration"} · {authority}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Society Incorporation Wizard
            </h2>
          </div>

          <div className="rounded-xl border border-border bg-surface shadow-card p-4">
            <Stepper steps={SOCIETY_STEPS} current={step} onGo={handleStepChange} />
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
                  <Field label="Proposed Society Name *" error={errors.societyName}>
                    <Input
                      value={societyName}
                      onChange={(v) => {
                        setSocietyName(v);
                        setErrors((prev) => ({ ...prev, societyName: "" }));
                      }}
                      placeholder="e.g. TELANGANA YOUTH EMPOWERMENT SOCIETY"
                      error={errors.societyName}
                    />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Applicant Mobile *" error={errors.applicantMobile}>
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

                    <Field label="Applicant Email" error={errors.applicantEmail}>
                      <Input
                        value={applicantEmail}
                        onChange={(v) => {
                          setApplicantEmail(v);
                          setErrors((prev) => ({ ...prev, applicantEmail: "" }));
                        }}
                        placeholder="applicant@society.org"
                        error={errors.applicantEmail}
                      />
                    </Field>
                  </div>
                </div>
              </Card>
            )}

            {/* STEP 2: Structure & Members */}
            {stepKey === "structure" && (
              <Card>
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field
                      label="Total Number of Members *"
                      error={errors.membersCount}
                    >
                      <Input
                        value={membersCount}
                        onChange={(v) => {
                          setMembersCount(v.replace(/\D/g, ""));
                          setErrors((prev) => ({ ...prev, membersCount: "" }));
                        }}
                        placeholder="e.g. 7"
                        error={errors.membersCount}
                      />
                    </Field>

                    <Field
                      label="Number of Executive Committee Members *"
                      error={errors.committeeCount}
                    >
                      <Input
                        value={committeeCount}
                        onChange={(v) => {
                          setCommitteeCount(v.replace(/\D/g, ""));
                          setErrors((prev) => ({ ...prev, committeeCount: "" }));
                        }}
                        placeholder="e.g. 3"
                        error={errors.committeeCount}
                      />
                    </Field>
                  </div>

                  <Field label="Registered Office Address of the Society *" error={errors.registeredAddress}>
                    <textarea
                      rows={2}
                      value={registeredAddress}
                      onChange={(e) => {
                        setRegisteredAddress(e.target.value);
                        setErrors((prev) => ({ ...prev, registeredAddress: "" }));
                      }}
                      placeholder="Door / Plot No., Building Name, Street / Road, Area / Locality"
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

            {/* STEP 3: Nature & Objects */}
            {stepKey === "nature" && (
              <Card>
                <div className="space-y-6">
                  <Field label="Category / Nature of Society *" error={errors.activity}>
                    <select
                      value={selectedActivity}
                      onChange={(e) => {
                        setSelectedActivity(e.target.value);
                        setErrors((prev) => ({ ...prev, activity: "" }));
                      }}
                      className={
                        "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
                        (errors.activity ? "border-destructive focus:ring-destructive/25" : "border-border")
                      }
                    >
                      {availableActivities.map((act) => (
                        <option key={act} value={act}>
                          {act}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Main Objects of the Society *" error={errors.societyObjects}>
                    <textarea
                      rows={4}
                      value={societyObjects}
                      onChange={(e) => {
                        setSocietyObjects(e.target.value);
                        setErrors((prev) => ({ ...prev, societyObjects: "" }));
                      }}
                      placeholder="State the core aims and objectives to be incorporated into the Memorandum of Association (MoA) and Rules & Regulations..."
                      className={
                        "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
                        (errors.societyObjects ? "border-destructive focus:ring-destructive/25" : "border-border")
                      }
                    />
                  </Field>
                </div>
              </Card>
            )}

            {/* STEP 4: Fee Breakdown */}
            {stepKey === "fees" && (
              <FeeBreakdown
                fees={fees}
                loading={catalogLoading}
                signedIn={!!user}
                onSignIn={() => setOpenSignIn(true)}
                state={officeState || state}
              />
            )}

            {/* STEP 5: Summary & Submission */}
            {stepKey === "summary" && (
              <SummaryPreview
                typeTitle={type?.title || "Society Registration"}
                societyName={societyName}
                state={officeState || state}
                membersCount={membersCount}
                committeeCount={committeeCount}
                category={selectedActivity}
                objects={societyObjects}
                address={fullAddress}
                fees={fees}
              />
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
            <button
              type="button"
              onClick={back}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-all cursor-pointer"
            >
              <ArrowLeft className="size-3.5" /> Back
            </button>

            <div className="flex items-center gap-3">
              {step === SOCIETY_STEPS.length - 1 ? (
                <>
                  <button
                    type="button"
                    onClick={downloadSummaryPdf}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Download className="size-4" /> Summary
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenReg(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
                  >
                    <Send className="size-4" /> Submit Application
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={next}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
                >
                  Next · {SOCIETY_STEPS[step + 1].label}
                  <ArrowRight className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar matching CompanyWizard */}
      <aside className="hidden lg:block w-80 border-l border-border bg-surface shrink-0">
        <div className="sticky top-16 p-6 space-y-6">
          <div>
            <div className="label-eyebrow mb-2.5 text-primary">Current Selection</div>
            <div className="rounded-lg border border-border bg-panel p-3.5 space-y-3">
              <div>
                <div className="text-[11px] text-muted-foreground font-medium">Structure</div>
                <div className="text-sm font-semibold text-foreground mt-0.5">
                  {type?.title || "Society Registration"}
                </div>
              </div>

              <div className="pt-2.5 border-t border-border/60">
                <div className="text-[11px] text-muted-foreground font-medium">State</div>
                <div className="text-xs font-semibold text-foreground mt-0.5">{officeState || state}</div>
              </div>

              {societyName && (
                <div className="pt-2.5 border-t border-border/60">
                  <div className="text-[11px] text-muted-foreground font-medium">Society Name</div>
                  <div className="text-xs font-semibold text-foreground mt-0.5 truncate">{societyName}</div>
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

          <div className="rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
            <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
            <div className="text-[11px] text-foreground/70 leading-relaxed">
              Cloudcrest legal associates prepare the MoA and Byelaws and coordinate with the District Registrar in {officeState || state}.
            </div>
          </div>
        </div>
      </aside>

      {/* Register Dialog */}
      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug={activeService?.slug || type?.slug || "society"}
        serviceTitle={`Society Registration — ${type?.title || "Society"} (${officeState || state})`}
        authority={authority}
        form={isGeneralSociety ? "Form A" : isMacs ? "Form I" : "Form 1"}
        documents={currentDocs}
        initialEmail={applicantEmail}
        initialPhone={applicantMobile}
        formData={{
          societyName,
          name1: societyName,
          applicantMobile,
          applicantEmail,
          societyType: type?.title || "Society",
          membersCount: Number(membersCount),
          committeeCount: Number(committeeCount),
          address: fullAddress,
          registeredAddress,
          city,
          pincode,
          state: officeState || state,
          category: selectedActivity,
          societyObjects,
          objects: `Category: ${selectedActivity}\nObjects: ${societyObjects}`,
        }}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your society registration — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/society"
      />
    </div>
  );
}

/* -------- UI Primitives matching CompanyWizard -------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6">
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
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  placeholder,
  error,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  error?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onKeyDown={blockNegativeKeys}
      onChange={(e) => onChange(nonNegative(Number(e.target.value)))}
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
          <span className="mono text-foreground font-semibold">{inr(line.amount)}</span>
        </div>
      ))}
      <div className="pt-3 mt-2 border-t border-border flex justify-between items-baseline">
        <span className="text-xs font-semibold">Total Estimated Cost</span>
        <span className="mono text-2xl font-semibold text-primary">
          {inr(fees.total)}
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
  state,
}: {
  fees: ResolvedFees;
  loading: boolean;
  signedIn: boolean;
  onSignIn: () => void;
  state: string;
}) {
  if (!signedIn) {
    return (
      <div className="rounded-xl border border-border bg-surface shadow-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Sign in to view fees</h3>
        </div>
        <p className="text-[13px] text-muted-foreground max-w-[60ch]">
          Fee estimates are available to signed-in customers. Sign in to see the
          breakdown, download the summary and submit your society application.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
        >
          Sign in to continue <ArrowRight className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Estimated Society Registration Fee Breakdown</h3>
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground py-4">Loading current pricing…</div>
      ) : (
        <FeeStack fees={fees} />
      )}
      <div className="pt-3 border-t border-border/60 text-[11px] text-muted-foreground">
        Includes MoA/Byelaws preparation, District Registrar filing in {state}, registration assistance, and PAN/TAN support.
      </div>
    </div>
  );
}

function SummaryPreview({
  typeTitle,
  societyName,
  state,
  membersCount,
  committeeCount,
  category,
  objects,
  address,
  fees,
}: {
  typeTitle: string;
  societyName: string;
  state: string;
  membersCount: string | number;
  committeeCount: string | number;
  category: string;
  objects: string;
  address: string;
  fees: ResolvedFees;
}) {
  const rows = [
    ["Entity Structure", typeTitle],
    ["Proposed Society Name", societyName || "—"],
    ["State of Registration", state],
    ["General Members", `${membersCount} Members`],
    ["Executive Committee", `${committeeCount} Members`],
    ["Category / Nature", category || "—"],
    ["Core MoA Objects", objects || "—"],
    ["Registered Office", address || "—"],
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
            <dd className="text-sm font-semibold text-foreground text-right leading-relaxed max-w-[280px]">
              {v}
            </dd>
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
