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
  Users, Building, HeartHandshake
} from "lucide-react";
import { blockNegativeKeys, nonNegative } from "@/lib/number-input";

const TRUST_STEPS = [
  { key: "basic", label: "Basic Details" },
  { key: "structure", label: "Structure" },
  { key: "nature", label: "Nature & Objects" },
  { key: "parties", label: "Parties Details" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const TRUST_TYPES: StateWizardType[] = [
  {
    key: "public",
    slug: "trust-public",
    title: "Public Trust",
    note: "Charitable or religious trust for the benefit of the public, registered with the Charity Commissioner / Sub-Registrar.",
    icon: HeartHandshake,
    recommended: true,
  },
  {
    key: "private",
    slug: "trust-private",
    title: "Private Trust",
    note: "Trust for specific, named beneficiaries (typically family) governed under the Indian Trusts Act, 1882.",
    icon: Lock,
  },
];

const TRUST_ACTIVITIES = [
  { id: "Charitable", label: "Charitable", desc: "General public welfare, poverty relief & community support" },
  { id: "Religious", label: "Religious", desc: "Maintenance of places of worship & religious practices" },
  { id: "Educational", label: "Educational", desc: "Schools, colleges, research institutes, scholarships & training" },
  { id: "Medical Relief", label: "Medical Relief", desc: "Hospitals, clinics, healthcare access & subsidized medical aid" },
  { id: "Relief of Poverty", label: "Relief of Poverty", desc: "Support for economically weaker sections, food & housing" },
  { id: "Other Public Utility", label: "Other Public Utility", desc: "Environmental protection, sanitation, water conservation, etc." },
  { id: "Private / Family", label: "Private / Family", desc: "Benefit of specific named family members or designated persons" },
];

const TRUSTEE_DESIGNATIONS = [
  "Managing Trustee",
  "Trustee",
];

const TRUST_CERTIFICATES = [
  "Trust Deed executed on Stamp Paper",
  "Sub-Registrar / Charity Commissioner Registration Filing",
  "Certificate of Registration / Registered Deed Copy",
  "Trust PAN Card",
  "Trust TAN",
  "12A & 80G Filing Guidance (Public Trust)",
  "Bank Account Resolution Draft",
];

const DOCS_PUBLIC_TRUST = [
  "PAN & Aadhaar of Settlor / Author",
  "PAN & Aadhaar of all Trustees",
  "Passport-size photographs of Settlor & Trustees",
  "Trust Deed Draft on Stamp Paper",
  "Proof of Registered Office Address (Electricity Bill / Property Tax Receipt)",
  "Rent Agreement & NOC from Property Owner (if rented)",
  "Settlor Consent Letter & Trustee Acceptance Letters",
  "12A & 80G Registration Guidance (Optional Post-Incorporation)",
];

const DOCS_PRIVATE_TRUST = [
  "PAN & Aadhaar of Settlor",
  "PAN & Aadhaar of all Trustees & Beneficiaries",
  "Passport-size photographs of Settlor & Trustees",
  "Private Trust Deed executed on Stamp Paper",
  "Proof of Registered Address / Trust Property Proof",
  "Consent of Trustees",
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

export type SettlorInfo = {
  fullName: string;
  pan: string;
  aadhaar: string;
  mobile: string;
  address: string;
};

export type TrusteeInfo = {
  fullName: string;
  pan: string;
  aadhaar: string;
  mobile: string;
  address: string;
  designation: string;
};

export function TrustWizard({
  initialName,
  slug,
}: {
  initialName?: string;
  slug?: string;
}) {
  const initialTypeKey = slug?.includes("private")
    ? "private"
    : slug?.includes("public")
      ? "public"
      : undefined;

  return (
    <EntityStateWizard
      config={{
        baseSlug: "trust",
        baseTitle: "Trust Registration",
        typeFormDataKey: "trustType",
        types: TRUST_TYPES,
        initialTypeKey,
        initialName,
        changeLabel: "Change type / state",
        hero: {
          eyebrow: "Charity Commissioner · Indian Trusts Act, 1882",
          title: "Trust Registration",
          subtitle:
            "Choose a public or private trust and your state. Each opens a full guide — who can apply, the documents you'll need and the fee — before you apply.",
          highlights: [
            { icon: ShieldCheck, label: "Indian Trusts Act, 1882" },
            { icon: FileText, label: "Trust Deed Drafting" },
            { icon: Users, label: "Trustee Management" },
            { icon: FileDown, label: "Downloadable Summary" },
          ],
        },
        typeStep: {
          eyebrow: "Step 1 · Trust type",
          heading: "Choose a trust type",
          subtitle: "Select a public or private trust, then pick your state.",
        },
        stateStep: {
          subtitle: "Trust registration is handled state-wise.",
        },
        renderWizard: ({ type, state, service, onBack, initialName: passedName }) => (
          <TrustStepperWizard
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
 * Trust Stepper Wizard styled exactly like CompanyWizard.
 */
export function TrustStepperWizard({
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
  const isPublic = type?.key !== "private";

  const [step, setStep] = useState(0);

  // Tab 1: Basic Details
  const [trustName, setTrustName] = useState(initialName || "");
  const [applicantMobile, setApplicantMobile] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");

  // Tab 2: Structure
  const [trusteesCount, setTrusteesCount] = useState("2");
  const [settlorName, setSettlorName] = useState("");
  const [corpusValue, setCorpusValue] = useState<string>("10000");
  const [registeredAddress, setRegisteredAddress] = useState("");
  const [officeState, setOfficeState] = useState(state || "Telangana");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");

  // Tab 3: Nature & Objects
  const [selectedActivities, setSelectedActivities] = useState<string[]>(["Charitable"]);
  const [trustObjects, setTrustObjects] = useState("");

  // Tab 4: Parties Details
  const [settlorDetails, setSettlorDetails] = useState<SettlorInfo>({
    fullName: "",
    pan: "",
    aadhaar: "",
    mobile: "",
    address: "",
  });

  const [trustees, setTrustees] = useState<TrusteeInfo[]>([
    { fullName: "", pan: "", aadhaar: "", mobile: "", address: "", designation: "Managing Trustee" },
    { fullName: "", pan: "", aadhaar: "", mobile: "", address: "", designation: "Trustee" },
  ]);

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  // Dynamic fee resolution from catalog
  const stateSlug =
    REGISTRATION_STATES.find((s) => s.name === officeState)?.slug ||
    state?.toLowerCase().replace(/\s+/g, "-");
  const typeSlug = type?.slug || (isPublic ? "trust-public" : "trust-private");
  const slugChain = stateSlug ? [`${typeSlug}-${stateSlug}`, typeSlug, "trust"] : [typeSlug, "trust"];
  const { service: dynamicService, loading: catalogLoading } = useCatalogService(slugChain);
  const activeService = dynamicService || service;

  const authority = isPublic ? "Charity Commissioner / Sub-Registrar" : "Sub-Registrar";
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

  // Sync settlorName
  useEffect(() => {
    if (settlorName && !settlorDetails.fullName) {
      setSettlorDetails((prev) => ({ ...prev, fullName: settlorName }));
    }
  }, [settlorName]);

  // Sync officeState
  useEffect(() => {
    if (state) setOfficeState(state);
  }, [state]);

  // Adjust trustees array
  useEffect(() => {
    const count = Number(trusteesCount) || 2;
    setTrustees((prev) => {
      const copy = [...prev];
      while (copy.length < count) {
        copy.push({
          fullName: "",
          pan: "",
          aadhaar: "",
          mobile: "",
          address: "",
          designation: copy.length === 0 ? "Managing Trustee" : "Trustee",
        });
      }
      return copy.slice(0, count);
    });
  }, [trusteesCount]);

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

  const stepKey = TRUST_STEPS[step]?.key;

  const toggleActivity = (actId: string) => {
    setSelectedActivities((prev) =>
      prev.includes(actId) ? (prev.length > 1 ? prev.filter((a) => a !== actId) : prev) : [...prev, actId]
    );
    setErrors((prev) => ({ ...prev, activities: "" }));
  };

  const updateTrustee = (index: number, field: keyof TrusteeInfo, value: string) => {
    setTrustees((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
    setErrors((prev) => ({ ...prev, [`trustee_${index}_${field}`]: "" }));
  };

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    const fail = (field: string, msg: string) => {
      newErrors[field] = msg;
      if (!globalMsg) globalMsg = msg;
    };

    if (currentStep === 0) {
      if (!trustName.trim()) fail("trustName", "Please enter the proposed name of the Trust.");
      if (!applicantMobile.trim()) {
        fail("applicantMobile", "Enter applicant mobile number.");
      } else if (!/^[6-9]\d{9}$/.test(applicantMobile.trim())) {
        fail("applicantMobile", "Enter a valid 10-digit Indian mobile number.");
      }
      if (applicantEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail.trim())) {
        fail("applicantEmail", "Enter a valid email address.");
      }
    } else if (currentStep === 1) {
      if (!trusteesCount || Number(trusteesCount) < 2) {
        fail("trusteesCount", "A minimum of 2 trustees is required.");
      }
      if (!settlorName.trim()) {
        fail("settlorName", "Enter Settlor / Author full name.");
      }
      if (!corpusValue || Number(corpusValue) <= 0) {
        fail("corpusValue", "Enter initial dedicated trust corpus amount.");
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
      if (!selectedActivities || selectedActivities.length === 0) {
        fail("activities", "Select at least one activity category.");
      }
      if (!trustObjects.trim()) {
        fail("trustObjects", "Please describe the main objects of the trust.");
      }
    } else if (currentStep === 3) {
      if (!settlorDetails.fullName.trim()) {
        fail("settlor_fullName", "Enter Settlor full name.");
      }
      if (settlorDetails.pan.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(settlorDetails.pan.trim())) {
        fail("settlor_pan", "Enter valid 10-character PAN.");
      }
      if (settlorDetails.aadhaar.trim() && !/^\d{12}$/.test(settlorDetails.aadhaar.trim())) {
        fail("settlor_aadhaar", "Enter valid 12-digit Aadhaar.");
      }

      trustees.forEach((t, idx) => {
        if (!t.fullName.trim()) {
          fail(`trustee_${idx}_fullName`, `Enter Full Name for Trustee ${idx + 1}.`);
        }
        if (t.pan.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(t.pan.trim())) {
          fail(`trustee_${idx}_pan`, `Invalid PAN for Trustee ${idx + 1}.`);
        }
        if (t.aadhaar.trim() && !/^\d{12}$/.test(t.aadhaar.trim())) {
          fail(`trustee_${idx}_aadhaar`, `Invalid Aadhaar for Trustee ${idx + 1}.`);
        }
      });
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
      setStep((s) => Math.min(TRUST_STEPS.length - 1, s + 1));
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

  const downloadSummaryPdf = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/summary/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Trust Registration — ${type?.title || "Trust"}`,
          name1: trustName,
          suffix: "Trust",
          form: "Trust Deed",
          address: fullAddress,
          city,
          state: officeState || state,
          pincode,
          capital: Number(corpusValue) || 10000,
          objects: `Activities: ${selectedActivities.join(", ")}\nObjects: ${trustObjects}`,
          fees: fees.lines,
          total,
          authority,
          documents: isPublic ? DOCS_PUBLIC_TRUST : DOCS_PRIVATE_TRUST,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate PDF summary");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const fileName = `Trust_Filing_Summary_${trustName ? trustName.trim().replace(/\s+/g, "_") : "Trust"}.pdf`;
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
              {type?.title || "Trust Registration"} · {authority}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Trust Formation Wizard
            </h2>
          </div>

          <div className="rounded-xl border border-border bg-surface shadow-card p-4">
            <Stepper steps={TRUST_STEPS} current={step} onGo={handleStepChange} />
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
                  <Field label="Proposed Trust Name *" error={errors.trustName}>
                    <Input
                      value={trustName}
                      onChange={(v) => {
                        setTrustName(v);
                        setErrors((prev) => ({ ...prev, trustName: "" }));
                      }}
                      placeholder="e.g. AAROHAN CHARITABLE TRUST"
                      error={errors.trustName}
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
                        placeholder="applicant@trust.org"
                        error={errors.applicantEmail}
                      />
                    </Field>
                  </div>
                </div>
              </Card>
            )}

            {/* STEP 2: Structure */}
            {stepKey === "structure" && (
              <Card>
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Number of Trustees *" error={errors.trusteesCount}>
                      <Input
                        value={trusteesCount}
                        onChange={(v) => {
                          setTrusteesCount(v.replace(/\D/g, ""));
                          setErrors((prev) => ({ ...prev, trusteesCount: "" }));
                        }}
                        placeholder="e.g. 2"
                        error={errors.trusteesCount}
                      />
                    </Field>

                    <Field label="Initial Corpus / Property Value (₹) *" error={errors.corpusValue}>
                      <Input
                        value={corpusValue}
                        onChange={(v) => {
                          setCorpusValue(v);
                          setErrors((prev) => ({ ...prev, corpusValue: "" }));
                        }}
                        placeholder="10000"
                        error={errors.corpusValue}
                      />
                    </Field>
                  </div>

                  <Field label="Name of Settlor / Author of the Trust *" error={errors.settlorName}>
                    <Input
                      value={settlorName}
                      onChange={(v) => {
                        setSettlorName(v);
                        setErrors((prev) => ({ ...prev, settlorName: "" }));
                      }}
                      placeholder="Full name of person founding/settling the trust"
                      error={errors.settlorName}
                    />
                  </Field>

                  <Field label="Registered Office Address of the Trust *" error={errors.registeredAddress}>
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
                  <Field label="Nature of Trust Activities * (Select one or more)" error={errors.activities}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2">
                      {TRUST_ACTIVITIES.map((act) => {
                        const isSel = selectedActivities.includes(act.id);
                        return (
                          <button
                            key={act.id}
                            type="button"
                            onClick={() => toggleActivity(act.id)}
                            className={
                              "text-left p-3 rounded-lg border transition-all flex items-start gap-2.5 " +
                              (isSel
                                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                                : "border-border bg-panel/30 hover:border-border-strong")
                            }
                          >
                            <span
                              className={
                                "size-4 rounded border mt-0.5 flex items-center justify-center shrink-0 transition-colors " +
                                (isSel
                                  ? "bg-primary border-primary text-white"
                                  : "border-muted-foreground/50 bg-surface")
                              }
                            >
                              {isSel && <CheckCircle2 className="size-3" />}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-foreground">{act.label}</div>
                              <div className="text-[11px] text-muted-foreground line-clamp-1">{act.desc}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <Field label="Main Objects of the Trust *" error={errors.trustObjects}>
                    <textarea
                      rows={4}
                      value={trustObjects}
                      onChange={(e) => {
                        setTrustObjects(e.target.value);
                        setErrors((prev) => ({ ...prev, trustObjects: "" }));
                      }}
                      placeholder="Describe the primary charitable, educational, medical, or religious objects to be incorporated into the Trust Deed..."
                      className={
                        "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
                        (errors.trustObjects ? "border-destructive focus:ring-destructive/25" : "border-border")
                      }
                    />
                  </Field>
                </div>
              </Card>
            )}

            {/* STEP 4: Parties Details */}
            {stepKey === "parties" && (
              <div className="space-y-6">
                {/* Settlor Details */}
                <Card>
                  <div className="flex items-center gap-2 pb-3 border-b border-border/70 mb-4">
                    <ShieldCheck className="size-4 text-primary" />
                    <h4 className="text-sm font-semibold">Settlor / Author Details</h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Full Name *" error={errors.settlor_fullName}>
                      <Input
                        value={settlorDetails.fullName}
                        onChange={(v) => {
                          setSettlorDetails((p) => ({ ...p, fullName: v }));
                          setErrors((prev) => ({ ...prev, settlor_fullName: "" }));
                        }}
                        placeholder="Settlor full name"
                        error={errors.settlor_fullName}
                      />
                    </Field>

                    <Field label="Mobile Number">
                      <Input
                        value={settlorDetails.mobile}
                        onChange={(v) =>
                          setSettlorDetails((p) => ({ ...p, mobile: format10DigitPhone(v) }))
                        }
                        placeholder="10-digit mobile"
                      />
                    </Field>

                    <Field label="PAN Number" error={errors.settlor_pan}>
                      <Input
                        value={settlorDetails.pan}
                        onChange={(v) => {
                          setSettlorDetails((p) => ({ ...p, pan: v.toUpperCase() }));
                          setErrors((prev) => ({ ...prev, settlor_pan: "" }));
                        }}
                        placeholder="ABCDE1234F"
                        error={errors.settlor_pan}
                      />
                    </Field>

                    <Field label="Aadhaar Number" error={errors.settlor_aadhaar}>
                      <Input
                        value={settlorDetails.aadhaar}
                        onChange={(v) => {
                          setSettlorDetails((p) => ({
                            ...p,
                            aadhaar: v.replace(/\D/g, "").slice(0, 12),
                          }));
                          setErrors((prev) => ({ ...prev, settlor_aadhaar: "" }));
                        }}
                        placeholder="12-digit Aadhaar"
                        error={errors.settlor_aadhaar}
                      />
                    </Field>
                  </div>

                  <div className="mt-4">
                    <Field label="Residential Address">
                      <Input
                        value={settlorDetails.address}
                        onChange={(v) => setSettlorDetails((p) => ({ ...p, address: v }))}
                        placeholder="Settlor residential address"
                      />
                    </Field>
                  </div>
                </Card>

                {/* Trustees Repeatable */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="size-4 text-primary" />
                      <h4 className="text-sm font-semibold">Trustees ({trustees.length})</h4>
                    </div>
                  </div>

                  {trustees.map((t, idx) => (
                    <Card key={idx}>
                      <div className="flex items-center justify-between border-b border-border/70 pb-2.5 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="size-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-semibold text-foreground">
                            Trustee {idx + 1} {t.fullName ? `· ${t.fullName}` : ""}
                          </span>
                        </div>
                        <span className="text-[11px] mono text-primary font-medium">
                          {t.designation || "Trustee"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Full Name *" error={errors[`trustee_${idx}_fullName`]}>
                          <Input
                            value={t.fullName}
                            onChange={(v) => updateTrustee(idx, "fullName", v)}
                            placeholder="Full name as per Aadhaar/PAN"
                            error={errors[`trustee_${idx}_fullName`]}
                          />
                        </Field>

                        <Field label="Designation in Trust *">
                          <select
                            value={t.designation}
                            onChange={(e) => updateTrustee(idx, "designation", e.target.value)}
                            className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow"
                          >
                            {TRUSTEE_DESIGNATIONS.map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </Field>

                        <Field label="PAN Number" error={errors[`trustee_${idx}_pan`]}>
                          <Input
                            value={t.pan}
                            onChange={(v) => updateTrustee(idx, "pan", v.toUpperCase())}
                            placeholder="ABCDE1234F"
                            error={errors[`trustee_${idx}_pan`]}
                          />
                        </Field>

                        <Field label="Aadhaar Number" error={errors[`trustee_${idx}_aadhaar`]}>
                          <Input
                            value={t.aadhaar}
                            onChange={(v) =>
                              updateTrustee(idx, "aadhaar", v.replace(/\D/g, "").slice(0, 12))
                            }
                            placeholder="12-digit Aadhaar"
                            error={errors[`trustee_${idx}_aadhaar`]}
                          />
                        </Field>
                      </div>

                      <div className="mt-4">
                        <Field label="Residential Address">
                          <Input
                            value={t.address}
                            onChange={(v) => updateTrustee(idx, "address", v)}
                            placeholder="Residential address"
                          />
                        </Field>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 5: Fee Breakdown */}
            {stepKey === "fees" && (
              <FeeBreakdown
                fees={fees}
                loading={catalogLoading}
                signedIn={!!user}
                onSignIn={() => setOpenSignIn(true)}
                state={officeState || state}
              />
            )}

            {/* STEP 6: Summary & Submission */}
            {stepKey === "summary" && (
              <SummaryPreview
                typeTitle={type?.title || "Trust Registration"}
                trustName={trustName}
                state={officeState || state}
                corpusValue={corpusValue}
                settlorName={settlorDetails.fullName || settlorName}
                trusteesCount={trustees.length}
                activities={selectedActivities.join(", ")}
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
              {step === TRUST_STEPS.length - 1 ? (
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
                  Next · {TRUST_STEPS[step + 1].label}
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
                  {type?.title || "Trust Registration"}
                </div>
              </div>

              <div className="pt-2.5 border-t border-border/60">
                <div className="text-[11px] text-muted-foreground font-medium">State</div>
                <div className="text-xs font-semibold text-foreground mt-0.5">{officeState || state}</div>
              </div>

              {trustName && (
                <div className="pt-2.5 border-t border-border/60">
                  <div className="text-[11px] text-muted-foreground font-medium">Trust Name</div>
                  <div className="text-xs font-semibold text-foreground mt-0.5 truncate">{trustName}</div>
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
              Cloudcrest legal associates prepare your trust deed on non-judicial stamp paper and coordinate Sub-Registrar / Charity Commissioner filing in {officeState || state}.
            </div>
          </div>
        </div>
      </aside>

      {/* Register Dialog */}
      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug={activeService?.slug || type?.slug || "trust"}
        serviceTitle={`Trust Registration — ${type?.title || "Trust"} (${officeState || state})`}
        authority={authority}
        form="Trust Deed"
        documents={isPublic ? DOCS_PUBLIC_TRUST : DOCS_PRIVATE_TRUST}
        initialEmail={applicantEmail}
        initialPhone={applicantMobile}
        capital={Number(corpusValue) || 10000}
        formData={{
          trustName,
          name1: trustName,
          applicantMobile,
          applicantEmail,
          trustType: type?.title || "Public Trust",
          trusteesCount: Number(trusteesCount),
          settlorName: settlorDetails.fullName || settlorName,
          corpusValue: Number(corpusValue),
          capital: Number(corpusValue),
          address: fullAddress,
          registeredAddress,
          city,
          pincode,
          state: officeState || state,
          natureActivities: selectedActivities,
          trustObjects,
          objects: `Activities: ${selectedActivities.join(", ")}\nObjects: ${trustObjects}`,
          settlorDetails,
          trustees,
        }}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your trust registration — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/trust"
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
          breakdown, download the summary and submit your trust application.
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
        <h3 className="text-sm font-semibold">Estimated Trust Registration Fee Breakdown</h3>
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground py-4">Loading current pricing…</div>
      ) : (
        <FeeStack fees={fees} />
      )}
      <div className="pt-3 border-t border-border/60 text-[11px] text-muted-foreground">
        Includes deed preparation, stamp duty guidance for {state}, registration assistance, and PAN/TAN support.
      </div>
    </div>
  );
}

function SummaryPreview({
  typeTitle,
  trustName,
  state,
  corpusValue,
  settlorName,
  trusteesCount,
  activities,
  address,
  fees,
}: {
  typeTitle: string;
  trustName: string;
  state: string;
  corpusValue: string;
  settlorName: string;
  trusteesCount: string | number;
  activities: string;
  address: string;
  fees: ResolvedFees;
}) {
  const rows = [
    ["Entity Structure", typeTitle],
    ["Proposed Trust Name", trustName || "—"],
    ["State of Registration", state],
    ["Settlor / Author", settlorName || "—"],
    ["Number of Trustees", `${trusteesCount} Trustees`],
    ["Initial Corpus Property", inr(Number(corpusValue) || 10000)],
    ["Nature of Activities", activities || "—"],
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
            <dd className="text-sm font-semibold text-foreground text-right">{v}</dd>
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
