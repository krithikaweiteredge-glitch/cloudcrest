import { useEffect, useMemo, useState } from "react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { useAuth } from "@/hooks/use-auth";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useCatalogService, resolveFees, resolveDocuments } from "@/lib/service-catalog";
import { ServiceDetailPage } from "@/components/service-detail-page";
import { TypePickerPage, type RegistrationType } from "@/components/type-picker-page";
import {
  EMAIL_RE, Field, FeesStep, IN_MOBILE_RE, Input, NoteBox,
  OptionCard, Section, WizardActions, WizardHero, WizardSidebar,
  downloadSummaryPdf, fetchProfileContact, format10DigitPhone,
} from "@/components/wizard-ui";
import { AlertTriangle, ArrowLeft, KeyRound, ShieldCheck, Sparkles, Zap, FileCheck2, FileText } from "lucide-react";

/**
 * Digital Signature Certificate (DSC) Wizard — source: "DSC.docx".
 *
 * DSC Types:
 *   1. Normal DSC (₹2,000) — Class 3 Signing Certificate for MCA, Income Tax, ROC filings.
 *   2. Combo DSC (₹4,000) — Class 3 Sign + Encrypt Certificate for e-Tendering, GST & Org Signatories.
 *
 * Registration flow asks for:
 *   - Applicant Name
 *   - Mobile Number
 *   - Email ID
 *   - Selected DSC Type
 */

const STEPS = [
  { key: "details", label: "Applicant" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

type DscTypeKey = "normal" | "combo";

interface DscTypeOption {
  key: DscTypeKey;
  title: string;
  price: number;
  badge: string;
}

const DSC_TYPES: DscTypeOption[] = [
  {
    key: "normal",
    title: "Normal DSC",
    price: 2000,
    badge: "Most Popular",
  },
  {
    key: "combo",
    title: "Combo DSC",
    price: 4000,
    badge: "e-Tendering & GST",
  },
];

const DOCS_NORMAL = [
  "PAN Card (mandatory)",
  "Aadhaar Card (for eKYC verification)",
  "Recent passport-size colour photograph",
];

const DOCS_COMBO = [
  "PAN Card (mandatory)",
  "Aadhaar Card (for eKYC verification)",
  "Recent passport-size colour photograph",
  "GST Certificate (extra required for organisation combo DSC)",
];

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "CCA Licensed Certifying Authority" },
  { icon: KeyRound, label: "Class 3 Crypto USB Token Included" },
  { icon: Zap, label: "Fast Paperless eKYC Allotment" },
];

const DSC_CERTIFICATES = [
  "Class 3 Digital Signature Certificate",
  "FIPS Certified Cryptographic USB Token",
  "Certificate Download Key & PIN",
];

const DSC_REGISTRATION_TYPES: RegistrationType[] = [
  {
    key: "normal",
    title: "Normal DSC",
    short: "Normal DSC",
    form: "Class 3 DSC",
    tags: ["Class 3", "Signing Only"],
    popular: true,
    blurb: "Class 3 signing certificate for MCA, Income Tax, and ROC filings.",
    about:
      "A Digital Signature Certificate (DSC) is a secure electronic signature issued by a Certifying Authority (CA) licensed by the Controller of Certifying Authorities (CCA) under the Information Technology Act, 2000. It authenticates the identity of the holder and is legally equivalent to a physical handwritten signature.\n\nDSC is mandatory for e-filing on the MCA portal (SPICe+, AGILE-PRO, etc.), Income Tax e-filing, GST filings, and other government portals. It ensures the security, authenticity, and integrity of electronic documents.",
    who: [
      "Indian individuals (residents & NRIs)",
      "Directors / Designated Partners of companies and LLPs",
      "Proprietors, Partners, and Authorized Signatories of businesses",
      "Foreign nationals and foreign entities (with additional attestation requirements)",
      "Professionals (CAs, CSs, lawyers, etc.) requiring DSC for official filings",
    ],
    docs: DOCS_NORMAL,
  },
  {
    key: "combo",
    title: "Combo DSC",
    short: "Combo DSC",
    form: "Class 3 Sign + Encrypt",
    tags: ["Sign + Encrypt", "e-Tendering & GST"],
    blurb: "Includes both signing and encryption certificates for tenders and GST.",
    about:
      "A Digital Signature Certificate (DSC) is a secure electronic signature issued by a Certifying Authority (CA) licensed by the Controller of Certifying Authorities (CCA) under the Information Technology Act, 2000. It authenticates the identity of the holder and is legally equivalent to a physical handwritten signature.\n\nA Class 3 Combo DSC contains dual certificates: a Signing certificate for digital signatures and an Encryption certificate for secure data transmission. Required for government e-tendering portals, GST filings, and foreign trade authentication.",
    who: [
      "Indian individuals (residents & NRIs)",
      "Directors / Designated Partners of companies and LLPs",
      "Proprietors, Partners, and Authorized Signatories of businesses",
      "Foreign nationals and foreign entities (with additional attestation requirements)",
      "Professionals (CAs, CSs, lawyers, etc.) requiring DSC for official filings",
    ],
    docs: DOCS_COMBO,
  },
];

const inr = (n: number) => `₹ ${n.toLocaleString("en-IN")}`;

/**
 * DSC module entry point — Type picker first (Normal vs Combo), leading to
 * the service detail page for that exact type, with "Start Application"
 * opening the wizard stepper.
 */
export function DscModule({ initialName, slug }: { initialName?: string; slug?: string }) {
  const initialKey = slug === "dsc-combo" ? "combo" : slug === "dsc-normal" ? "normal" : undefined;
  const [selectedTypeKey, setSelectedTypeKey] = useState<DscTypeKey | undefined>(initialKey);
  const [applying, setApplying] = useState(false);

  if (applying && selectedTypeKey) {
    return (
      <DscWizard
        initialName={initialName}
        initialType={selectedTypeKey}
        onBack={() => setApplying(false)}
      />
    );
  }

  return (
    <TypePickerPage
      catalogSlug="dsc"
      titlePrefix="Digital Signature Certificate — "
      formDataKey="dscType"
      backLabel="Change DSC type"
      initialKey={selectedTypeKey}
      onSelectKey={(k) => setSelectedTypeKey(k ? (k as DscTypeKey) : undefined)}
      onStartApplication={(k) => {
        setSelectedTypeKey(k as DscTypeKey);
        setApplying(true);
      }}
      hero={{
        badge: "Information Technology Act, 2000 · CCA Class 3",
        title: "Digital Signature Certificate (DSC)",
        subtitle:
          "Pick the type of DSC you need. Each opens a full guide — eligible applicants, required documents, and fee breakdown — before you apply.",
        highlights: HIGHLIGHTS,
      }}
      picker={{
        eyebrow: "Types of Digital Signature Certificates",
        heading: "Choose your DSC certificate type",
        subtitle:
          "Select a certificate category to see eligible applicants, required documents, and start your application.",
      }}
      types={DSC_REGISTRATION_TYPES}
    />
  );
}

export function DscWizard({
  initialName,
  initialType = "normal",
  onBack: onExit,
}: {
  initialName?: string;
  initialType?: DscTypeKey;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Form State
  const [dscType, setDscType] = useState<DscTypeKey>(initialType);
  useEffect(() => {
    setDscType(initialType);
  }, [initialType]);
  const [applicantName, setApplicantName] = useState(initialName || "");
  const [applicantMobile, setApplicantMobile] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  // Prefill contact from authenticated user
  useEffect(() => {
    if (!user) return;
    setApplicantEmail((prev) => prev || user.email || "");
    setApplicantMobile((prev) => prev || format10DigitPhone(user.phone));
    fetchProfileContact().then((c) => {
      if (!c) return;
      setApplicantEmail((prev) => prev || c.email || user.email || "");
      setApplicantMobile((prev) => prev || c.phone || format10DigitPhone(user.phone));
    });
  }, [user]);

  const stepKey = STEPS[step]?.key;
  const isCombo = dscType === "combo";
  const selectedType = DSC_TYPES.find((t) => t.key === dscType) || DSC_TYPES[0];
  const variantSlug = isCombo ? "dsc-combo" : "dsc-normal";
  const { service, loading: catalogLoading } = useCatalogService([variantSlug, "dsc"]);

  const fallbackFee = {
    professional: selectedType.price,
    govt: 0,
    gstPercent: 18,
  };

  const fees = useMemo(() => {
    // If admin configured custom fee lines in catalog, respect them
    if (service?.feeLines && service.feeLines.length > 0) {
      return resolveFees(service, "Certifying Authority (CCA)", fallbackFee);
    }
    const profFee =
      typeof service?.professionalFee === "number" && service.professionalFee > 0
        ? service.professionalFee
        : selectedType.price;
    const gstPct = typeof service?.gstPercent === "number" && service.gstPercent > 0 ? service.gstPercent : 18;
    const gstAmt = Math.round((profFee * gstPct) / 100);
    const tot = profFee + gstAmt;
    return {
      lines: [
        { label: `${selectedType.title} Professional Fee`, amount: profFee },
        { label: `GST @ ${gstPct}% (on professional fee)`, amount: gstAmt },
      ],
      total: tot,
      fromCatalog: true,
    };
  }, [service, isCombo, selectedType]);

  const total = fees.total;

  const activeDocuments = resolveDocuments(service, isCombo ? DOCS_COMBO : DOCS_NORMAL).documents;

  const validateStep = (currentStep: number): boolean => {
    const nextErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    const fail = (field: string, msg: string) => {
      nextErrors[field] = msg;
      if (!globalMsg) globalMsg = msg;
    };

    if (currentStep === 0) {
      if (!applicantName.trim()) fail("applicantName", "Please enter applicant full name.");
      else if (applicantName.trim().length < 2) fail("applicantName", "Name is too short.");

      if (!applicantMobile.trim()) {
        fail("applicantMobile", "Enter applicant mobile number.");
      } else if (!IN_MOBILE_RE.test(applicantMobile.trim())) {
        fail("applicantMobile", "Enter a valid 10-digit Indian mobile number.");
      }

      if (!applicantEmail.trim()) {
        fail("applicantEmail", "Enter applicant email address.");
      } else if (!EMAIL_RE.test(applicantEmail.trim())) {
        fail("applicantEmail", "Enter a valid email address.");
      }
    }

    setErrors(nextErrors);
    setStepError(globalMsg);
    return Object.keys(nextErrors).length === 0 && !globalMsg;
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

  const downloadSummary = () => {
    downloadSummaryPdf(
      {
        title: `Digital Signature Certificate (${selectedType.title})`,
        name1: applicantName,
        form: "Class 3 DSC",
        directors: 1,
        capital: 0,
        address: "India",
        city: "",
        state: "All India (CCA)",
        pincode: "",
        objects: `DSC Type: ${selectedType.title}\nApplicant: ${applicantName}\nPhone: ${applicantMobile}\nEmail: ${applicantEmail}`,
        fees: fees.lines,
        total,
      },
      `DSC_Summary_${applicantName ? applicantName.trim().replace(/\s+/g, "_") : "Application"}.pdf`,
    );
  };

  return (
    <div>
      <WizardHero
        title="Digital Signature Certificate (DSC)"
        subtitle="Class 3 digital signature issuance licensed under the Controller of Certifying Authorities (CCA). Valid for MCA, Income Tax, GST, and e-Tendering."
        highlights={HIGHLIGHTS}
      />

      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-6 md:px-10 py-8 animate-in-up">
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <ArrowLeft className="size-3.5" /> Back to DSC service details
              </button>
            )}

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">
                Information Technology Act, 2000 · CCA Class 3 DSC
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                DSC Application Wizard
              </h2>
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

            <div key={step} className="mt-8 animate-in-up">
              {/* STEP 1: Applicant Details */}
              {stepKey === "details" && (
                <Section
                  title="1. Applicant Contact Details"
                  desc={`Applying for ${selectedType.title}`}
                >
                  <div className="space-y-4">
                    <Field label="Applicant Full Name *" error={errors.applicantName}>
                      <Input
                        value={applicantName}
                        onChange={(v) => {
                          setApplicantName(v);
                          setErrors((prev) => ({ ...prev, applicantName: "" }));
                        }}
                        placeholder="e.g. Rajesh Sharma (as per PAN / Aadhaar)"
                        error={errors.applicantName}
                      />
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field
                        label="Applicant Mobile Number *"
                        error={errors.applicantMobile}
                      >
                        <Input
                          type="tel"
                          maxLength={10}
                          value={applicantMobile}
                          onChange={(v) => {
                            setApplicantMobile(v.replace(/\D/g, "").slice(0, 10));
                            setErrors((prev) => ({ ...prev, applicantMobile: "" }));
                          }}
                          placeholder="10-digit mobile number"
                          error={errors.applicantMobile}
                        />
                      </Field>

                      <Field
                        label="Applicant Email ID *"
                        error={errors.applicantEmail}
                      >
                        <Input
                          type="email"
                          value={applicantEmail}
                          onChange={(v) => {
                            setApplicantEmail(v);
                            setErrors((prev) => ({ ...prev, applicantEmail: "" }));
                          }}
                          placeholder="e.g. rajesh@example.com"
                          error={errors.applicantEmail}
                        />
                      </Field>
                    </div>
                  </div>
                </Section>
              )}

              {/* STEP 2: Fees */}
              {stepKey === "fees" && (
                <FeesStep
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                  loading={catalogLoading}
                  lines={fees.lines}
                  total={total}
                  heading={`Estimated ${selectedType.title} Fee Breakdown`}
                  unpricedNote="Pricing for DSC will be finalized by your Cloudcrest advisor."
                />
              )}

              {/* STEP 3: Summary */}
              {stepKey === "summary" && (
                <Section title="Application Summary" desc="Review your DSC order before submission.">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                        <Sparkles className="size-3.5" />
                        Digital Signature Certificate Application Preview
                      </div>
                      <span className="text-[10px] mono px-2 py-0.5 rounded bg-success/15 text-success font-semibold">
                        READY TO SUBMIT
                      </span>
                    </div>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-border/70 bg-panel/40 p-3 sm:col-span-2">
                        <dt className="text-muted-foreground">DSC Plan</dt>
                        <dd className="font-semibold text-foreground text-sm mt-0.5 flex items-center justify-between">
                          <span>{selectedType.title}</span>
                          <span className="mono text-primary">{inr(selectedType.price)}</span>
                        </dd>
                      </div>

                      <div className="rounded-lg border border-border/70 bg-panel/40 p-3">
                        <dt className="text-muted-foreground">Applicant Name</dt>
                        <dd className="font-semibold text-foreground mt-0.5">{applicantName || "—"}</dd>
                      </div>

                      <div className="rounded-lg border border-border/70 bg-panel/40 p-3">
                        <dt className="text-muted-foreground">Applicant Mobile</dt>
                        <dd className="font-semibold text-foreground mt-0.5 mono">{applicantMobile || "—"}</dd>
                      </div>

                      <div className="sm:col-span-2 rounded-lg border border-border/70 bg-panel/40 p-3">
                        <dt className="text-muted-foreground">Applicant Email</dt>
                        <dd className="font-semibold text-foreground mt-0.5">{applicantEmail || "—"}</dd>
                      </div>

                      <div className="sm:col-span-2 rounded-lg border border-border/70 bg-panel/40 p-3">
                        <dt className="text-muted-foreground mb-1.5">Documents to Upload Upon Submission</dt>
                        <dd className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {activeDocuments.map((doc) => (
                            <span key={doc} className="flex items-center gap-1.5 text-[11px] text-foreground/90">
                              <span className="size-1 rounded-full bg-success" />
                              {doc}
                            </span>
                          ))}
                        </dd>
                      </div>

                      <div className="sm:col-span-2 rounded-lg border border-primary/25 bg-primary/[0.04] p-3.5 flex justify-between items-center">
                        <div>
                          <dt className="text-muted-foreground font-medium">Total Estimated Cost</dt>
                          <dd className="font-bold text-primary text-lg mono mt-0.5">{inr(total)}</dd>
                        </div>
                        <div className="text-[11px] text-muted-foreground text-right">
                          Includes Professional Fee + 18% GST
                        </div>
                      </div>
                    </dl>
                  </div>
                </Section>
              )}

              {/* Wizard Actions */}
              <WizardActions
                step={step}
                stepCount={STEPS.length}
                nextLabel={step < STEPS.length - 1 ? STEPS[step + 1].label : undefined}
                onBack={back}
                onNext={next}
                onDownload={downloadSummary}
                onSubmit={() => setOpenReg(true)}
              />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <WizardSidebar
          selection={[
            { label: "DSC Plan", value: selectedType.title },
            { label: "Class", value: "Class 3 (Individual / Org)" },
            ...(applicantName ? [{ label: "Applicant", value: applicantName }] : []),
          ]}
          professionalFee={fees.lines[0]?.amount || selectedType.price}
          gstPercent={18}
          formNo="CCA Class 3"
          certificates={DSC_CERTIFICATES}
        />
      </div>

      {/* Submission Register Dialog */}
      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="dsc"
        serviceTitle={`Digital Signature Certificate — ${selectedType.title}`}
        authority="Certifying Authority (CCA)"
        form="Class 3 DSC"
        documents={activeDocuments}
        initialEmail={applicantEmail}
        initialPhone={applicantMobile}
        formData={{
          applicantName,
          name1: applicantName,
          applicantMobile,
          applicantEmail,
          dscType: selectedType.title,
          dscPlan: selectedType.key,
          price: selectedType.price,
          objects: `DSC Type: ${selectedType.title}\nApplicant: ${applicantName}\nPhone: ${applicantMobile}\nEmail: ${applicantEmail}`,
        }}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to view fee breakdown and submit your DSC application."
        next="/m/dsc"
      />
    </div>
  );
}
