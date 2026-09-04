import { useEffect, useMemo, useState } from "react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { useAuth } from "@/hooks/use-auth";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useCatalogService, resolveFees } from "@/lib/service-catalog";
import { ServiceDetailPage } from "@/components/service-detail-page";
import {
  DateInput, EMAIL_RE, Field, FeesStep, IFSC_RE, IN_MOBILE_RE, Input, NoteBox,
  OptionCard, Section, Select, WizardActions, WizardHero, WizardSidebar,
  downloadSummaryPdf, fetchProfileContact, format10DigitPhone,
} from "@/components/wizard-ui";
import { AlertTriangle, HomeIcon, ShieldCheck } from "lucide-react";

/**
 * RERA project registration wizard — source: "Updated RERA.html".
 *
 * Steps follow the four cards of that form in order, plus the Fees / Summary
 * pair every wizard has:
 *   1 Jurisdiction & Promoter Type · 2 Promoter Profile
 *   3 Project & the 70% RERA bank account · 4 Documents
 *
 * The HTML collects every attachment as an inline <input type="file">. This app
 * uploads after submission instead — RegisterDialog turns the `documents`
 * checklist into one upload control per entry. The wizard therefore never shows
 * the checklist itself: repeating it as read-only text in a step, a sidebar and
 * a summary only put pages between the applicant and the actual upload panel.
 */
const STEPS = [
  { key: "jurisdiction", label: "Jurisdiction" },
  { key: "promoter", label: "Promoter" },
  { key: "project", label: "Project & Bank" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

/** The three states the form covers, with the authority that registers there. */
const STATES = [
  { value: "TS", label: "Telangana (TGRERA)", authority: "TGRERA" },
  { value: "AP", label: "Andhra Pradesh (APRERA)", authority: "APRERA" },
  { value: "KA", label: "Karnataka (K-RERA)", authority: "K-RERA" },
];

/** Promoter types open in each state — HTML `promoterOptions`. */
const PROMOTER_TYPES: Record<string, string[]> = {
  TS: ["Individual", "Company", "Societies", "Partnership Firm", "Trust", "Competent Authority"],
  AP: ["Individual", "Partnership Firm", "Company", "Societies", "Competent Authority", "Local Authority"],
  KA: ["Individual", "Partnership Firm", "Company", "Societies", "Trust", "Development Authority"],
};

const PROJECT_TYPES = [
  { value: "Residential", label: "Residential" },
  { value: "Commercial", label: "Commercial" },
  { value: "Mixed", label: "Mixed Development" },
  { value: "Plotted", label: "Plotted Development" },
];

/** Card 4 of the HTML — the core mandatory uploads, in its order. */
const CORE_DOCS = [
  "Promoter PAN card",
  "Last 3 years audited financials (ITR, P&L)",
  "Approved layout / building plan",
  "Land ownership / title deed",
  "Encumbrance Certificate (EC)",
  "Declaration affidavit (Form B)",
];
/** Shown only for an Individual promoter — HTML `#aadhaar-upload-field`. */
const INDIVIDUAL_DOC = "Promoter Aadhaar card";
const BANK_DOC = "Cancelled cheque or first page of the bank statement (70% RERA account)";

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "TGRERA · APRERA · K-RERA" },
  { icon: HomeIcon, label: "70% Escrow Account Setup" },
];

const RERA_CERTIFICATES = ["RERA project registration certificate & registration number"];

/** ₹5,999 + 18% GST. The state authority's own registration fee is assessed per
 *  square metre of the project and is paid separately — it is not bundled here.
 *  Overridden by admin pricing on the `rera` catalog row. */
const FEE_FALLBACK = { professional: 5999, govt: 0, gstPercent: 18 };

/**
 * RERA module entry point — service page first, stepper behind "Start
 * Application", the same shape as MSME / NGO Darpan.
 */
export function ReraModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <ReraWizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug="rera" onStartApplication={() => setApplying(true)} />;
}

export function ReraWizard({ initialName, onBack: onExit }: { initialName?: string; onBack?: () => void }) {
  const { user } = useAuth();

  const [step, setStep] = useState(0);

  // Step 1 — jurisdiction and promoter type.
  const [state, setState] = useState("");
  const [promoterType, setPromoterType] = useState("");

  // Step 2 — promoter profile.
  //
  // The HTML reveals the promoter's name only for an Individual promoter, which
  // would leave a company's application with no applicant name at all. The field
  // is collected for every promoter type here and only its label follows the
  // HTML's Individual / entity split.
  const [promoterName, setPromoterName] = useState(initialName || "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Step 3 — project and the 70% RERA account. No default: the HTML leaves both
  // bank radios unchecked.
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("");
  const [commencementDate, setCommencementDate] = useState("");
  const [completionDate, setCompletionDate] = useState("");
  const [bankMode, setBankMode] = useState<"upload" | "manual" | "">("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankBranch, setBankBranch] = useState("");
  const [ifsc, setIfsc] = useState("");

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setEmail((prev) => prev || user.email || "");
    setPhone((prev) => prev || format10DigitPhone(user.phone));
    fetchProfileContact().then((c) => {
      if (!c) return;
      setEmail((prev) => prev || c.email || user.email || "");
      setPhone((prev) => prev || c.phone || format10DigitPhone(user.phone));
    });
  }, [user]);

  const stepKey = STEPS[step]?.key;

  const stateConfig = STATES.find((s) => s.value === state);
  const promoterOptions = PROMOTER_TYPES[state] ?? [];
  const isIndividual = promoterType === "Individual";
  const authority = stateConfig?.authority ?? "State RERA";

  // Changing the state invalidates a promoter type that state doesn't offer.
  useEffect(() => {
    setPromoterType((prev) => (promoterOptions.includes(prev) ? prev : ""));
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const { service, loading: catalogLoading } = useCatalogService(["rera"]);
  const fees = resolveFees(service, authority, FEE_FALLBACK);
  const total = fees.total;

  const professionalFee =
    (fees.lines.find((l) => /professional/i.test(l.label))?.amount || 0) || FEE_FALLBACK.professional;

  /**
   * Checklist from card 4 of the HTML: the core set always, the promoter's
   * Aadhaar only for an Individual, and the bank proof only when the applicant
   * chose to upload rather than type the 70% account details.
   *
   * Deliberately NOT run through resolveDocuments(): the catalog holds one flat
   * list per service and cannot express those two conditions. Pricing still
   * comes from the catalog above.
   */
  const documents = useMemo(() => {
    const list = ["Promoter PAN card"];
    if (isIndividual) list.push(INDIVIDUAL_DOC);
    list.push(...CORE_DOCS.slice(1));
    if (bankMode === "upload") list.push(BANK_DOC);
    return list;
  }, [isIndividual, bankMode]);

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    const fail = (field: string, msg: string) => {
      newErrors[field] = msg;
      if (!globalMsg) globalMsg = msg;
    };

    if (currentStep === 0) {
      if (!state) fail("state", "Please select the state of registration.");
      if (!promoterType) fail("promoterType", "Please select the applicant / promoter type.");
    } else if (currentStep === 1) {
      if (!promoterName.trim()) {
        fail("promoterName", isIndividual ? "The promoter's name is required." : "The promoter entity's name is required.");
      }
      if (!EMAIL_RE.test(email.trim())) fail("email", "Enter a valid contact email ID.");
      if (!IN_MOBILE_RE.test(phone.trim())) fail("phone", "Enter a valid 10-digit mobile number.");
    } else if (currentStep === 2) {
      if (!projectName.trim()) fail("projectName", "Project name is required.");
      if (!projectType) fail("projectType", "Please select the project type.");
      if (!commencementDate) fail("commencementDate", "Expected commencement date is required.");
      if (!completionDate) fail("completionDate", "Proposed completion date is required.");
      if (commencementDate && completionDate && completionDate <= commencementDate) {
        fail("completionDate", "Completion must be later than commencement.");
      }
      if (!bankMode) fail("bankMode", "Please choose how you'll provide the 70% RERA account details.");
      if (bankMode === "manual") {
        if (!accountNumber.trim()) fail("accountNumber", "The dedicated RERA account number is required.");
        if (!bankBranch.trim()) fail("bankBranch", "Bank name & branch are required.");
        if (!ifsc.trim()) fail("ifsc", "IFSC code is required.");
        else if (!IFSC_RE.test(ifsc.trim().toUpperCase())) fail("ifsc", "Enter a valid 11-character IFSC (e.g. HDFC0001234).");
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

  const onDownload = () =>
    downloadSummaryPdf(
      {
        title: "RERA Project Registration",
        name1: promoterName,
        name2: projectName,
        form: authority,
        objects: projectType,
        state: stateConfig?.label ?? "",
        fees: fees.lines,
        total,
      },
      `RERA_Summary_${projectName ? projectName.trim().replace(/\s+/g, "_") : "Project"}.pdf`,
    );

  return (
    <div>
      <WizardHero
        eyebrow="TGRERA · APRERA · K-RERA"
        title="RERA Project Registration"
        blurb="Guided Cloudcrest BM workspace for registering a real-estate project under RERA — jurisdiction and promoter type, project timeline, the mandatory 70% escrow account and the full document set, through to your registration number."
        highlights={HIGHLIGHTS}
      />

      <div className="flex">
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-10 py-8 animate-in-up">
            {onExit && (
              <button
                onClick={onExit}
                className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                ← Back to RERA service details
              </button>
            )}

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">RERA Registration · {authority}</div>
              <h2 className="text-2xl font-semibold tracking-tight">RERA Project Registration Wizard</h2>
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
                <span className="font-semibold text-foreground">70% rule · </span>
                Section 4(2)(l)(D) requires a separate bank account holding 70% of the amounts realised
                from allottees, used only for that project's land and construction cost. The account has
                to exist before registration.
              </div>
            </div>

            <div key={step} className="mt-8 animate-in-up">
              {/* STEP 1 — JURISDICTION */}
              {stepKey === "jurisdiction" && (
                <Section
                  title="Jurisdiction & Promoter Type"
                  desc="RERA is a state subject — the state decides which promoter types can register and under which authority."
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="State of Registration *" error={errors.state}>
                      <Select value={state} onChange={setState} error={errors.state}>
                        <option value="">— Select state —</option>
                        {STATES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Applicant / Promoter Type *" error={errors.promoterType}>
                      <Select
                        value={promoterType}
                        onChange={setPromoterType}
                        error={errors.promoterType}
                        disabled={promoterOptions.length === 0}
                      >
                        <option value="">
                          {promoterOptions.length === 0 ? "— Select the state first —" : "— Select type —"}
                        </option>
                        {promoterOptions.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  {isIndividual && (
                    <NoteBox>
                      <span className="font-semibold text-foreground">Individual promoter · </span>
                      Your Aadhaar has been added to the document checklist alongside PAN — an
                      individual promoter has to prove identity as well as tax registration.
                    </NoteBox>
                  )}
                </Section>
              )}

              {/* STEP 2 — PROMOTER */}
              {stepKey === "promoter" && (
                <Section
                  title="Promoter Profile & Details"
                  desc={`Who is registering the project with ${authority}, and where they can be reached.`}
                >
                  <Field
                    label={isIndividual ? "Name of the Promoter (legal name as per PAN) *" : "Name of the Promoter Entity (as per PAN) *"}
                    error={errors.promoterName}
                  >
                    <Input
                      value={promoterName}
                      onChange={setPromoterName}
                      placeholder={isIndividual ? "e.g. Ramesh Kumar Sharma" : "e.g. Sunrise Estates Private Limited"}
                      error={errors.promoterName}
                    />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Contact Email ID *" error={errors.email}>
                      <Input value={email} onChange={setEmail} placeholder="name@example.com" error={errors.email} type="email" />
                    </Field>
                    <Field label="Contact Mobile Number *" error={errors.phone}>
                      <Input value={phone} onChange={setPhone} placeholder="9876543210" maxLength={10} error={errors.phone} />
                    </Field>
                  </div>
                </Section>
              )}

              {/* STEP 3 — PROJECT & BANK */}
              {stepKey === "project" && (
                <Section
                  title="Project & 70% RERA Bank Account"
                  desc="The project being registered and the dedicated account that holds 70% of the amounts realised from allottees."
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Project Name *" error={errors.projectName}>
                      <Input value={projectName} onChange={setProjectName} placeholder="e.g. Sunrise Enclave Phase II" error={errors.projectName} />
                    </Field>
                    <Field label="Project Type *" error={errors.projectType}>
                      <Select value={projectType} onChange={setProjectType} error={errors.projectType}>
                        <option value="">— Select —</option>
                        {PROJECT_TYPES.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Expected Commencement Date *" error={errors.commencementDate}>
                      <DateInput value={commencementDate} onChange={setCommencementDate} error={errors.commencementDate} />
                    </Field>
                    <Field label="Proposed Completion Date *" error={errors.completionDate}>
                      <DateInput value={completionDate} onChange={setCompletionDate} error={errors.completionDate} />
                    </Field>
                  </div>

                  <div className="pt-2 border-t border-dashed border-border">
                    <div className="text-xs font-medium text-foreground/90 mb-2.5">
                      How would you like to provide your 70% RERA bank account details? *
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <OptionCard
                        active={bankMode === "upload"}
                        onClick={() => setBankMode("upload")}
                        title="Upload proof"
                        subtitle="Cancelled cheque or the first page of a bank statement."
                      />
                      <OptionCard
                        active={bankMode === "manual"}
                        onClick={() => setBankMode("manual")}
                        title="Enter manually"
                        subtitle="Type the account number, bank & branch and IFSC."
                      />
                    </div>
                    {errors.bankMode && <p className="text-[11px] text-destructive font-medium mt-2">{errors.bankMode}</p>}
                  </div>

                  {bankMode === "upload" && (
                    <NoteBox>
                      Nothing to upload here — a slot for the cancelled cheque / bank statement is added
                      to your document checklist and opens when you submit.
                    </NoteBox>
                  )}

                  {bankMode === "manual" && (
                    <div className="space-y-4 pt-1">
                      <Field label="Dedicated RERA Bank Account Number (70% rule) *" error={errors.accountNumber}>
                        <Input value={accountNumber} onChange={setAccountNumber} placeholder="Account number" error={errors.accountNumber} />
                      </Field>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Bank Name & Branch *" error={errors.bankBranch}>
                          <Input value={bankBranch} onChange={setBankBranch} placeholder="e.g. HDFC Bank, Banjara Hills" error={errors.bankBranch} />
                        </Field>
                        <Field label="IFSC Code *" error={errors.ifsc}>
                          <Input value={ifsc} onChange={(v) => setIfsc(v.toUpperCase())} placeholder="11-character code" maxLength={11} error={errors.ifsc} />
                        </Field>
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* STEP 4 — FEES */}
              {stepKey === "fees" && (
                <FeesStep
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                  loading={catalogLoading}
                  lines={fees.lines}
                  total={total}
                  heading="Estimated RERA Fee Breakdown"
                  unpricedNote="Pricing for RERA isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
                />
              )}

              {/* STEP 6 — SUMMARY */}
              {stepKey === "summary" && (
                <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary">
                      RERA Project Registration Preview
                    </div>
                    <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning font-semibold">
                      READY TO SUBMIT
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">State / Authority</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{stateConfig?.label || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Promoter Type</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{promoterType || "—"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Promoter</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{promoterName || "—"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Project</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {projectName || "—"}{projectType ? ` · ${projectType}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Commencement</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">{commencementDate || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Completion</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">{completionDate || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Contact Email</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{email || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Contact Mobile</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">{phone || "—"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">70% RERA Account</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {bankMode === "manual"
                          ? `${bankBranch} · A/c ending ${accountNumber.slice(-4) || "—"} · ${ifsc.toUpperCase()}`
                          : bankMode === "upload"
                            ? "Proof to be uploaded"
                            : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              <WizardActions
                step={step}
                stepCount={STEPS.length}
                nextLabel={STEPS[step + 1]?.label}
                onBack={back}
                onNext={next}
                onDownload={onDownload}
                onSubmit={() => setOpenReg(true)}
              />
            </div>
          </div>
        </div>

        <WizardSidebar
          selection={[
            { label: "State / Authority", value: stateConfig?.label ?? "" },
            { label: "Promoter Type", value: promoterType },
          ]}
          professionalFee={professionalFee}
          gstPercent={FEE_FALLBACK.gstPercent}
          certificates={RERA_CERTIFICATES}
        />
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="rera"
        serviceTitle="RERA Project Registration"
        authority={authority}
        initialEmail={email}
        initialPhone={phone}
        formData={{
          state: stateConfig?.label ?? state,
          reraAuthority: authority,
          promoterType,
          promoterName,
          contactEmail: email,
          contactPhone: phone,
          projectName,
          projectType,
          commencementDate,
          completionDate,
          bankMode,
          ...(bankMode === "manual"
            ? { reraAccountNumber: accountNumber, bankBranch, ifsc: ifsc.toUpperCase() }
            : {}),
        }}
        documents={documents}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your RERA project registration — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/rera"
      />
    </div>
  );
}
