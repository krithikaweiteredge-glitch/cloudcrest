import { useState, useEffect } from "react";
import { EntityStateWizard } from "@/components/entity-state-wizard";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useAuth } from "@/hooks/use-auth";
import { resolveFees, type CatalogService } from "@/lib/service-catalog";
import { INDIAN_STATES } from "@/lib/form-options";
import {
  ShieldCheck, ScrollText, ClipboardList, FileDown,
  AlertTriangle, ArrowLeft, ArrowRight,
  Send, Download, Lock, Sparkles, Zap, FileText,
} from "lucide-react";

/**
 * Sole Proprietorship Registration flow
 * Source document: "Sole proprietorship.docx"
 *
 * Tab 1:
 *  1. Name of the enterprise / sole proprietorship
 *  2. Applicant Mobile
 *  3. Applicant Mail
 *
 * Tab 2:
 *  4. Registered Address
 *  5. Major Activity of the Enterprise (Dropdown: Manufacturing, Service, Trading)
 *
 * Followed by:
 *  - Fees breakdown
 *  - Summary with PDF download
 *  - Submit Application modal (RegisterDialog)
 */

const SOLE_PROPRIETORSHIP_STEPS = [
  { key: "enterprise", label: "Enterprise & Applicant" },
  { key: "office", label: "Office & Activity" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const SOLE_PROPRIETORSHIP_DOCS = [
  "Owner PAN",
  "Owner Aadhaar",
  "Electricity Bill",
  "Rental Agreement / NOC",
];

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Simple Individual Ownership" },
  { icon: ScrollText, label: "PAN & Aadhaar Based" },
  { icon: Zap, label: "Trade & Labour Licences" },
  { icon: FileDown, label: "Downloadable Summary" },
];

const FEE_FALLBACK = { professional: 999, govt: 0, gstPercent: 18 };

function format10DigitPhone(phoneStr?: string | null): string {
  if (!phoneStr) return "";
  let cleaned = phoneStr.trim();
  if (cleaned.startsWith("+91")) cleaned = cleaned.slice(3);
  else if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(2);
  cleaned = cleaned.replace(/\D/g, "");
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
}

const inr = (n: number) => `₹ ${n.toLocaleString("en-IN")}`;

export function SoleProprietorshipWizard({
  initialName,
  slug: _slug,
}: {
  initialName?: string;
  slug?: string;
}) {
  return (
    <EntityStateWizard
      config={{
        baseSlug: "sole-proprietorship",
        baseTitle: "Sole Proprietorship Registration",
        initialName,
        changeLabel: "Change state",
        hero: {
          eyebrow: "Sole Proprietorship Registration",
          title: "Sole Proprietorship Registration",
          subtitle:
            "Register a sole proprietorship. Choose your state to open a full guide — who can apply, the documents you'll need and the fee — before you apply.",
          highlights: [
            { icon: ShieldCheck, label: "Right Structure Guidance" },
            { icon: ScrollText, label: "Documents Checklist" },
            { icon: ClipboardList, label: "Guided Application" },
            { icon: FileDown, label: "Tracked Submission" },
          ],
        },
        stateStep: {
          subtitle: "Sole proprietorship registration is handled state-wise.",
        },
        renderWizard: ({ state, service, onBack, initialName }) => (
          <SoleProprietorshipStepperWizard
            state={state}
            service={service}
            onBack={onBack}
            initialName={initialName}
          />
        ),
      }}
    />
  );
}

/**
 * Multi-step Sole Proprietorship Application Stepper.
 * Opens when the customer clicks "Start Application" on the service detail page.
 */
export function SoleProprietorshipStepperWizard({
  state,
  service,
  onBack: onExit,
  initialName,
}: {
  state: string;
  service: CatalogService;
  onBack: () => void;
  initialName?: string;
}) {
  const { user } = useAuth();

  const [step, setStep] = useState(0);

  // Tab 1: Enterprise & Applicant
  const [enterpriseName, setEnterpriseName] = useState(initialName || "");
  const [applicantMobile, setApplicantMobile] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");

  // Tab 2: Office & Activity
  const [registeredAddress, setRegisteredAddress] = useState("");
  const [officeState, setOfficeState] = useState(state || "Telangana");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [majorActivity, setMajorActivity] = useState("Manufacturing");
  const [businessDescription, setBusinessDescription] = useState("");

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  // Sync officeState when parent state prop updates
  useEffect(() => {
    if (state) {
      setOfficeState(state);
    }
  }, [state]);

  // Prefill from profile
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
      .catch((err) => console.error("Error prefilling wizard profile:", err));
  }, [user]);

  const stepKey = SOLE_PROPRIETORSHIP_STEPS[step]?.key;

  const fees = resolveFees(service, "Municipal & State Dept.", FEE_FALLBACK);
  const total = fees.total;

  const professionalFee =
    fees.lines.find((l) => /professional/i.test(l.label))?.amount || FEE_FALLBACK.professional;

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    const fail = (field: string, msg: string) => {
      newErrors[field] = msg;
      if (!globalMsg) globalMsg = msg;
    };

    if (currentStep === 0) {
      if (!enterpriseName.trim()) fail("enterpriseName", "Please enter the name of the enterprise / sole proprietorship.");
      if (!applicantMobile.trim()) {
        fail("applicantMobile", "Enter applicant mobile number.");
      } else if (!/^[6-9]\d{9}$/.test(applicantMobile.trim())) {
        fail("applicantMobile", "Enter a valid 10-digit Indian mobile number.");
      }
      if (!applicantEmail.trim()) {
        fail("applicantEmail", "Enter applicant email address.");
      } else if (!/^\S+@\S+\.\S+$/.test(applicantEmail.trim())) {
        fail("applicantEmail", "Enter a valid email address.");
      }
    } else if (currentStep === 1) {
      if (!registeredAddress.trim()) {
        fail("registeredAddress", "Please enter the registered office address.");
      } else if (registeredAddress.trim().length < 5) {
        fail("registeredAddress", "Please provide a complete registered office address.");
      }
      if (!officeState.trim()) {
        fail("officeState", "Please select state.");
      }
      if (!city.trim()) {
        fail("city", "Please enter city.");
      }
      if (!pincode.trim() || !/^[1-9][0-9]{5}$/.test(pincode.trim())) {
        fail("pincode", "Enter valid 6-digit Indian PIN Code.");
      }
      if (!majorActivity) {
        fail("majorActivity", "Please select the major activity of the enterprise.");
      }
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
      setStep((s) => Math.min(SOLE_PROPRIETORSHIP_STEPS.length - 1, s + 1));
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
      const fullAddress = [registeredAddress, city, officeState, pincode ? `- ${pincode}` : ""].filter(Boolean).join(", ").replace(", - ", " - ");
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/summary/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Sole Proprietorship Registration",
          name1: enterpriseName,
          form: "Trade / Labour Licences",
          address: fullAddress || registeredAddress,
          city,
          state: officeState || state,
          pincode,
          objects: `Major Activity: ${majorActivity}${businessDescription ? `\nBusiness / Product Description: ${businessDescription}` : ""}`,
          fees: fees.lines,
          total,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate PDF summary");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const fileName = `Sole_Proprietorship_Summary_${enterpriseName ? enterpriseName.trim().replace(/\s+/g, "_") : "Enterprise"}.pdf`;
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
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, oklch(0.7 0.19 45 / 0.4), transparent 40%), radial-gradient(circle at 80% 80%, oklch(0.6 0.18 240 / 0.5), transparent 45%)",
          }}
        />
        <div className="hero-grid" />
        <div className="relative px-6 md:px-10 py-10 max-w-5xl">
          <h1 className="text-3xl md:text-[42px] font-semibold font-display tracking-tight leading-[1.05]">
            Sole Proprietorship Registration — {state}
          </h1>
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
      <div className="flex flex-col lg:flex-row">
        {/* Center Panel */}
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-6 md:px-10 py-8 animate-in-up">
            {onExit && (
              <button
                onClick={onExit}
                className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <ArrowLeft className="size-3.5" /> Back to Sole Proprietorship service details
              </button>
            )}

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">
                Individual Business Setup · Trade & Labour Licences
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Sole Proprietorship Registration Wizard
              </h2>
            </div>

            {/* Stepper Header */}
            <div className="rounded-xl border border-border bg-surface shadow-card p-4">
              <Stepper steps={SOLE_PROPRIETORSHIP_STEPS} current={step} onGo={handleStepChange} />
            </div>

            {/* Error Notification */}
            {stepError && (
              <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 flex items-center gap-2.5 text-xs text-destructive animate-in fade-in-50">
                <AlertTriangle className="size-4 shrink-0" />
                <span className="font-semibold">{stepError}</span>
              </div>
            )}

            {/* Step Contents */}
            <div key={step} className="mt-8 animate-in-up">
              {/* STEP 1: Enterprise & Applicant Details (Tab 1) */}
              {stepKey === "enterprise" && (
                <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-5">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight">Enterprise & Applicant Information</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Enter the name of your enterprise and the proprietor's contact details.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground/90 block">
                      1. Name of the Enterprise / Sole Proprietorship *
                    </label>
                    <input
                      type="text"
                      value={enterpriseName}
                      onChange={(e) => setEnterpriseName(e.target.value)}
                      placeholder="e.g. Apex Traders / Horizon Enterprises"
                      className={
                        "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
                        (errors.enterpriseName ? "border-destructive focus:ring-destructive/25" : "border-border")
                      }
                    />
                    {errors.enterpriseName && (
                      <p className="text-[11px] text-destructive mt-1">{errors.enterpriseName}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground/90 block">
                        2. Applicant Mobile Number *
                      </label>
                      <input
                        type="tel"
                        value={applicantMobile}
                        maxLength={10}
                        onChange={(e) => setApplicantMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        placeholder="10-digit mobile number"
                        className={
                          "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
                          (errors.applicantMobile ? "border-destructive focus:ring-destructive/25" : "border-border")
                        }
                      />
                      {errors.applicantMobile ? (
                        <p className="text-[11px] text-destructive mt-1">{errors.applicantMobile}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Used for official communications and licence deliveries.
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground/90 block">
                        3. Applicant Email ID *
                      </label>
                      <input
                        type="email"
                        value={applicantEmail}
                        onChange={(e) => setApplicantEmail(e.target.value)}
                        placeholder="e.g. proprietor@example.com"
                        className={
                          "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
                          (errors.applicantEmail ? "border-destructive focus:ring-destructive/25" : "border-border")
                        }
                      />
                      {errors.applicantEmail && (
                        <p className="text-[11px] text-destructive mt-1">{errors.applicantEmail}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Office & Activity (Tab 2) */}
              {stepKey === "office" && (
                <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-5">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight">Registered Address & Major Activity</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Provide the registered address and choose the primary business activity.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground/90 block">
                      4. Registered Address *
                    </label>
                    <textarea
                      rows={3}
                      value={registeredAddress}
                      onChange={(e) => {
                        setRegisteredAddress(e.target.value);
                        setErrors((prev) => ({ ...prev, registeredAddress: "" }));
                      }}
                      placeholder="Shop / Door No., Commercial Complex / Building, Street / Road, Area / Locality"
                      className={
                        "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
                        (errors.registeredAddress ? "border-destructive focus:ring-destructive/25" : "border-border")
                      }
                    />
                    {errors.registeredAddress && (
                      <p className="text-[11px] text-destructive mt-1">{errors.registeredAddress}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground/90 block">
                        State *
                      </label>
                      <select
                        value={officeState}
                        onChange={(e) => {
                          setOfficeState(e.target.value);
                          setErrors((prev) => ({ ...prev, officeState: "" }));
                        }}
                        className={
                          "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
                          (errors.officeState ? "border-destructive focus:ring-destructive/25" : "border-border")
                        }
                      >
                        <option value="">Select State</option>
                        {INDIAN_STATES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      {errors.officeState && (
                        <p className="text-[11px] text-destructive mt-1">{errors.officeState}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground/90 block">
                        City *
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => {
                          setCity(e.target.value);
                          setErrors((prev) => ({ ...prev, city: "" }));
                        }}
                        placeholder="e.g. Hyderabad"
                        className={
                          "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
                          (errors.city ? "border-destructive focus:ring-destructive/25" : "border-border")
                        }
                      />
                      {errors.city && (
                        <p className="text-[11px] text-destructive mt-1">{errors.city}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground/90 block">
                        PIN Code *
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={pincode}
                        onChange={(e) => {
                          setPincode(e.target.value.replace(/\D/g, "").slice(0, 6));
                          setErrors((prev) => ({ ...prev, pincode: "" }));
                        }}
                        placeholder="e.g. 500081"
                        className={
                          "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow mono " +
                          (errors.pincode ? "border-destructive focus:ring-destructive/25" : "border-border")
                        }
                      />
                      {errors.pincode && (
                        <p className="text-[11px] text-destructive mt-1">{errors.pincode}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground/90 block">
                      5. Major Activity of the Enterprise *
                    </label>
                    <select
                      value={majorActivity}
                      onChange={(e) => {
                        setMajorActivity(e.target.value);
                        setErrors((prev) => ({ ...prev, majorActivity: "" }));
                      }}
                      className={
                        "w-full bg-input border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow " +
                        (errors.majorActivity ? "border-destructive focus:ring-destructive/25" : "border-border")
                      }
                    >
                      <option value="Manufacturing">Manufacturing</option>
                      <option value="Service">Service</option>
                      <option value="Trading">Trading</option>
                    </select>
                    {errors.majorActivity && (
                      <p className="text-[11px] text-destructive mt-1">{errors.majorActivity}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground/90 block">
                      6. Brief Description of Business / Product
                    </label>
                    <textarea
                      rows={3}
                      value={businessDescription}
                      onChange={(e) => setBusinessDescription(e.target.value)}
                      placeholder="Briefly describe your business activities, products manufactured/traded, or services provided..."
                      className="w-full bg-input border border-border rounded-lg px-3.5 py-2.5 text-sm ring-focus transition-shadow"
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: Fees */}
              {stepKey === "fees" && (
                !user ? (
                  <div className="rounded-xl border border-border bg-surface shadow-card p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Lock className="size-4 text-primary" />
                      <h3 className="text-sm font-semibold">Sign in to view fees</h3>
                    </div>
                    <p className="text-[13px] text-muted-foreground max-w-[60ch]">
                      Fee estimates are available to signed-in customers. Sign in to see the itemized
                      breakdown, download the summary and submit your application.
                    </p>
                    <button
                      onClick={() => setOpenSignIn(true)}
                      className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
                    >
                      Sign in to continue <ArrowRight className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="size-4 text-primary" />
                      <h3 className="text-sm font-semibold">
                        Estimated Sole Proprietorship Fee Breakdown
                      </h3>
                    </div>

                    {total > 0 ? (
                      <div className="space-y-2.5 text-xs">
                        {fees.lines.map((line) => (
                          <div key={line.label} className="flex justify-between items-center py-1">
                            <span className="text-muted-foreground flex items-center gap-2">
                              <span className="size-1.5 rounded-full bg-primary/60" />
                              {line.label}
                            </span>
                            <span className="mono font-semibold">{inr(line.amount)}</span>
                          </div>
                        ))}
                        <div className="pt-3 border-t border-border flex justify-between items-baseline font-bold text-sm">
                          <span>Total Estimated Cost</span>
                          <span className="mono text-primary text-xl font-display">{inr(total)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[13px] text-muted-foreground">
                        Pricing for this state will be confirmed by your Cloudcrest BM advisor. You can proceed with submission.
                      </div>
                    )}
                  </div>
                )
              )}

              {/* STEP 4: Summary */}
              {stepKey === "summary" && (
                <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                      <Sparkles className="size-3.5" />
                      Sole Proprietorship Application Preview
                    </div>
                    <span className="text-[10px] mono px-2 py-0.5 rounded bg-success/15 text-success font-semibold">
                      READY TO SUBMIT
                    </span>
                  </div>

                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="sm:col-span-2 rounded-lg border border-border/70 bg-panel/40 p-3">
                      <dt className="text-muted-foreground">Enterprise Name</dt>
                      <dd className="font-semibold text-foreground text-sm mt-0.5">{enterpriseName || "—"}</dd>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-panel/40 p-3">
                      <dt className="text-muted-foreground">Applicant Mobile</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">{applicantMobile || "—"}</dd>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-panel/40 p-3">
                      <dt className="text-muted-foreground">Applicant Email</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{applicantEmail || "—"}</dd>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-panel/40 p-3">
                      <dt className="text-muted-foreground">State of Registration</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{officeState || state || "—"}</dd>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-panel/40 p-3">
                      <dt className="text-muted-foreground">Major Activity</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{majorActivity || "—"}</dd>
                    </div>

                    {businessDescription && (
                      <div className="sm:col-span-2 rounded-lg border border-border/70 bg-panel/40 p-3">
                        <dt className="text-muted-foreground">Business / Product Description</dt>
                        <dd className="font-semibold text-foreground mt-0.5 leading-relaxed">{businessDescription}</dd>
                      </div>
                    )}

                    <div className="sm:col-span-2 rounded-lg border border-border/70 bg-panel/40 p-3">
                      <dt className="text-muted-foreground">Registered Address</dt>
                      <dd className="font-semibold text-foreground mt-0.5 leading-relaxed">
                        {registeredAddress ? `${registeredAddress}${city ? `, ${city}` : ""}${officeState ? `, ${officeState}` : ""}${pincode ? ` - ${pincode}` : ""}` : "—"}
                      </dd>
                    </div>

                    <div className="sm:col-span-2 rounded-lg border border-primary/25 bg-primary/[0.04] p-3 flex justify-between items-center">
                      <div>
                        <dt className="text-muted-foreground">Total Estimated Cost</dt>
                        <dd className="font-bold text-primary text-base mono mt-0.5">{inr(total)}</dd>
                      </div>
                      <div className="text-[11px] text-muted-foreground text-right">
                        Includes Professional Fee & 18% GST
                      </div>
                    </div>
                  </dl>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
                <button
                  onClick={back}
                  disabled={step === 0}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-all cursor-pointer"
                >
                  <ArrowLeft className="size-3.5" /> Back
                </button>

                <div className="flex items-center gap-3">
                  {step === SOLE_PROPRIETORSHIP_STEPS.length - 1 ? (
                    <>
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
                    </>
                  ) : (
                    <button
                      onClick={next}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
                    >
                      Next · {SOLE_PROPRIETORSHIP_STEPS[step + 1].label}
                      <ArrowRight className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="hidden lg:block w-80 border-l border-border bg-surface">
          <div className="sticky top-16 p-6 space-y-6">
            <div>
              <div className="label-eyebrow mb-2.5 text-primary">Current Selection</div>
              <div className="rounded-lg border border-border bg-panel p-3.5 space-y-3 text-xs">
                <div>
                  <div className="text-[11px] text-muted-foreground font-medium">Structure</div>
                  <div className="text-sm font-semibold text-foreground mt-0.5">
                    Sole Proprietorship
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-muted-foreground font-medium">State</div>
                  <div className="text-sm font-semibold text-foreground mt-0.5">{state}</div>
                </div>

                {enterpriseName && (
                  <div>
                    <div className="text-[11px] text-muted-foreground font-medium">Enterprise Name</div>
                    <div className="text-sm font-semibold text-foreground mt-0.5 truncate">{enterpriseName}</div>
                  </div>
                )}

                <div className="pt-2.5 border-t border-border/60">
                  <div className="text-[11px] text-muted-foreground font-medium">Professional Fee</div>
                  <div className="text-xs font-semibold mono text-primary mt-0.5">
                    ₹{professionalFee.toLocaleString("en-IN")} + 18% GST
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Submit Application Modal (RegisterDialog) */}
      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug={service.slug}
        serviceTitle={`Sole Proprietorship Registration — ${state}`}
        authority="Municipal & State Dept."
        form="Trade / Labour Licences"
        documents={SOLE_PROPRIETORSHIP_DOCS}
        initialEmail={applicantEmail}
        initialPhone={applicantMobile}
        formData={{
          enterpriseName,
          name1: enterpriseName,
          firmName: enterpriseName,
          applicantMobile,
          applicantEmail,
          address: [registeredAddress, city, officeState, pincode ? `- ${pincode}` : ""].filter(Boolean).join(", ").replace(", - ", " - ") || registeredAddress,
          registeredAddress,
          city,
          pincode,
          state: officeState || state,
          majorActivity,
          natureOfBusiness: majorActivity,
          businessDescription,
        }}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to view fee breakdown and submit your sole proprietorship registration."
        next={`/m/${service.slug}`}
      />
    </div>
  );
}

