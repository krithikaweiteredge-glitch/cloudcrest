import { useEffect, useMemo, useState } from "react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { useAuth } from "@/hooks/use-auth";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useCatalogService, resolveFees } from "@/lib/service-catalog";
import { ServiceDetailPage } from "@/components/service-detail-page";
import {
  EMAIL_RE, Field, FeesStep, IFSC_RE, IN_MOBILE_RE, Input, NoteBox,
  OptionCard, Section, Select, WizardActions, WizardHero, WizardSidebar,
  downloadSummaryPdf, fetchProfileContact, format10DigitPhone,
} from "@/components/wizard-ui";
import { AlertTriangle, Globe, ShieldCheck } from "lucide-react";

/**
 * DGFT Importer-Exporter Code (IEC) wizard — source: "IEC updated.html".
 *
 * Steps follow the three cards of that form in order, plus the Fees / Summary
 * pair every wizard has:
 *   1 Firm / Entity Profile · 2 Official Bank Account · 3 Authorised Signatory
 *
 * The HTML collects the signatory's identity proofs as inline <input type="file">.
 * This app uploads after submission instead — RegisterDialog turns the
 * `documents` checklist into one upload control per entry. The wizard therefore
 * never renders the checklist itself — as a step, in the rail, or on the summary.
 * Repeating it as read-only text only put pages between the applicant and the
 * upload panel that actually takes the files.
 */
const STEPS = [
  { key: "profile", label: "Entity Profile" },
  { key: "bank", label: "Bank" },
  { key: "signatory", label: "Signatory" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

/** Firm types exactly as DGFT lists them (HTML `#entity_type`). */
const ENTITY_TYPES = [
  { value: "Proprietorship", label: "Proprietorship" },
  { value: "Partnership", label: "Partnership Firm" },
  { value: "LLP", label: "Limited Liability Partnership (LLP)" },
  { value: "PrivateLimited", label: "Private Limited Company" },
  { value: "PublicLimited", label: "Public Limited Company" },
  { value: "Govt", label: "Government Undertaking" },
  { value: "Section8", label: "Section 25 / Section 8 Company" },
  { value: "Society", label: "Registered Society" },
  { value: "Trust", label: "Trust" },
  { value: "HUF", label: "Hindu Undivided Family (HUF)" },
];

/** Designations open to each firm type — HTML `entityDesignations`. */
const ENTITY_DESIGNATIONS: Record<string, string[]> = {
  Proprietorship: ["Proprietor"],
  Partnership: ["Partner"],
  LLP: ["Designated Partner", "Partner"],
  PrivateLimited: ["Director", "Managing Director"],
  PublicLimited: ["Director", "Managing Director"],
  Govt: ["Authorized Officer", "Director"],
  Section8: ["Director"],
  Society: ["President", "Secretary", "Treasurer"],
  Trust: ["Managing Trustee", "Trustee"],
  HUF: ["Karta"],
};

/** Nature of operations + the explainer the HTML shows beneath it. */
const OPERATIONS = [
  { value: "Merchant", label: "Merchant Exporter", note: "A Merchant Exporter buys goods from manufacturers and exports them under their own name." },
  { value: "Manufacturer", label: "Manufacturer Exporter", note: "A Manufacturer Exporter produces goods and exports them directly." },
  { value: "MerchantManufacturer", label: "Merchant cum Manufacturer", note: "An entity that acts as both a manufacturer of physical goods and a merchant for others." },
  { value: "ServiceProvider", label: "Service Provider", note: "A Service Provider exports digital, consulting, or professional services instead of physical goods." },
  { value: "MerchantService", label: "Merchant cum Service Provider", note: "An entity that acts as a merchant exporter and also provides exportable services." },
  { value: "ManufacturerService", label: "Manufacturer cum Service Provider", note: "An entity that manufactures goods for export and also provides exportable services." },
  { value: "Others", label: "Others", note: "Select this if your operational structure does not fall under standard definitions." },
];

/**
 * Entity-level documents DGFT requires against every IEC application, plus the
 * signatory's identity set from card 3 of the HTML. The bank proof is appended
 * only when the applicant chose to upload rather than type their bank details.
 */
const ENTITY_DOCS = [
  "Firm / entity PAN card (the proprietor's PAN for a proprietorship)",
  "Business address proof — utility bill / rent agreement / sale deed",
];
const SIGNATORY_DOCS = [
  "Authorised signatory — Aadhaar card",
  "Authorised signatory — PAN card",
  "Authorised signatory — Government ID (Passport / Voter ID)",
];
const BANK_DOC = "Cancelled cheque or first page of the bank statement";

/** Registration certificate expected per firm type, where one exists. */
const REGISTRATION_DOC: Record<string, string> = {
  Partnership: "Registered partnership deed",
  LLP: "LLP Certificate of Incorporation",
  PrivateLimited: "Certificate of Incorporation (COI)",
  PublicLimited: "Certificate of Incorporation (COI)",
  Govt: "Government notification / constitution order",
  Section8: "Certificate of Incorporation (COI) & Section 8 licence",
  Society: "Society registration certificate",
  Trust: "Registered trust deed",
  // Proprietorship and HUF have no separate registration certificate — the PAN
  // and address proof above are the whole entity-side set.
};

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "DGFT Portal Filing" },
  { icon: Globe, label: "Lifetime IEC — No Renewal" },
];

const IEC_CERTIFICATES = ["IEC certificate (DGFT)"];

/** ₹999 + 18% GST. The DGFT application fee is paid to the portal separately and
 *  is not bundled here. Overridden by admin pricing on the `iec` catalog row. */
const FEE_FALLBACK = { professional: 999, govt: 0, gstPercent: 18 };

/**
 * IEC module entry point — service page first, stepper behind "Start
 * Application", the same shape as MSME / NGO Darpan.
 */
export function IecModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <IecWizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug="iec" onStartApplication={() => setApplying(true)} />;
}

export function IecWizard({ initialName, onBack: onExit }: { initialName?: string; onBack?: () => void }) {
  const { user } = useAuth();

  const [step, setStep] = useState(0);

  // Step 1 — firm / entity profile.
  const [firmName, setFirmName] = useState(initialName || "");
  const [entityType, setEntityType] = useState("");
  const [operations, setOperations] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Step 2 — bank details. No default: the HTML leaves both radios unchecked.
  const [bankMode, setBankMode] = useState<"upload" | "manual" | "">("");
  const [accountHolder, setAccountHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");

  // Step 3 — authorised signatory.
  const [signatoryName, setSignatoryName] = useState("");
  const [designation, setDesignation] = useState("");

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

  const entityLabel = ENTITY_TYPES.find((e) => e.value === entityType)?.label || "";
  const designations = ENTITY_DESIGNATIONS[entityType] ?? [];
  /** The HTML retitles card 3 with the designations open to the chosen type. */
  const signatoryTitle = designations.length > 0 ? designations.join(" / ") : "Authorized Party";
  const operationConfig = OPERATIONS.find((o) => o.value === operations);

  // Changing the firm type invalidates a designation picked under the old one.
  useEffect(() => {
    setDesignation((prev) => (designations.includes(prev) ? prev : ""));
  }, [entityType]); // eslint-disable-line react-hooks/exhaustive-deps

  const { service, loading: catalogLoading } = useCatalogService(["iec"]);
  const fees = resolveFees(service, "DGFT", FEE_FALLBACK);
  const total = fees.total;

  const professionalFee =
    (fees.lines.find((l) => /professional/i.test(l.label))?.amount || 0) || FEE_FALLBACK.professional;

  /**
   * Checklist built from the firm type and the bank choice. Deliberately NOT run
   * through resolveDocuments(): the catalog holds one flat list per service and
   * cannot express the per-firm-type registration certificate. Pricing still
   * comes from the catalog above.
   */
  const documents = useMemo(() => {
    const list = [...ENTITY_DOCS];
    const regDoc = REGISTRATION_DOC[entityType];
    if (regDoc) list.push(regDoc);
    if (bankMode === "upload") list.push(BANK_DOC);
    return [...list, ...SIGNATORY_DOCS];
  }, [entityType, bankMode]);

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    const fail = (field: string, msg: string) => {
      newErrors[field] = msg;
      if (!globalMsg) globalMsg = msg;
    };

    if (currentStep === 0) {
      if (!firmName.trim()) fail("firmName", "Please enter the firm / entity name.");
      if (!entityType) fail("entityType", "Please select the firm / entity type.");
      if (!operations) fail("operations", "Please select the nature of operations.");
      if (!EMAIL_RE.test(email.trim())) fail("email", "Enter a valid email ID — DGFT sends the OTP to it.");
      if (!IN_MOBILE_RE.test(phone.trim())) fail("phone", "Enter a valid 10-digit mobile number — DGFT sends the OTP to it.");
    } else if (currentStep === 1) {
      if (!bankMode) fail("bankMode", "Please choose how you'll provide the bank details.");
      if (bankMode === "manual") {
        if (!accountHolder.trim()) fail("accountHolder", "Account holder name is required.");
        if (!bankName.trim()) fail("bankName", "Bank name is required.");
        if (!branchName.trim()) fail("branchName", "Branch name is required.");
        if (!accountNumber.trim()) fail("accountNumber", "Account number is required.");
        if (!ifsc.trim()) fail("ifsc", "IFSC code is required.");
        else if (!IFSC_RE.test(ifsc.trim().toUpperCase())) fail("ifsc", "Enter a valid 11-character IFSC (e.g. HDFC0001234).");
      }
    } else if (currentStep === 2) {
      if (!signatoryName.trim()) fail("signatoryName", "Authorised signatory's name is required.");
      if (!designation) fail("designation", "Please select the signatory's designation.");
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
        title: "IEC (Importer-Exporter Code) Registration",
        name1: firmName,
        form: "ANF-2A",
        objects: operationConfig?.label ?? "",
        fees: fees.lines,
        total,
      },
      `IEC_Summary_${firmName ? firmName.trim().replace(/\s+/g, "_") : "Firm"}.pdf`,
    );

  return (
    <div>
      <WizardHero
        eyebrow="DGFT · Form ANF-2A"
        title="IEC Import-Export Registration"
        blurb="Guided Cloudcrest BM workspace for the DGFT Importer-Exporter Code — firm profile, nature of operations, the official bank account and the authorised signatory, through to your IEC certificate."
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
                ← Back to IEC service details
              </button>
            )}

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">IEC Registration · DGFT / ANF-2A</div>
              <h2 className="text-2xl font-semibold tracking-tight">IEC Application Wizard</h2>
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
                <span className="font-semibold text-foreground">OTP-verified filing · </span>
                DGFT sends a one-time password to the email ID and mobile number below. Give us details
                you can access while we file, or the application cannot be submitted.
              </div>
            </div>

            <div key={step} className="mt-8 animate-in-up">
              {/* STEP 1 — ENTITY PROFILE */}
              {stepKey === "profile" && (
                <Section
                  title="Firm / Entity Profile"
                  desc="Who is applying for the IEC, and what they trade in."
                >
                  <Field label="Firm / Entity Name *" error={errors.firmName}>
                    <Input value={firmName} onChange={setFirmName} placeholder="Name as printed on the PAN" error={errors.firmName} />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Firm / Entity Type (DGFT standard) *" error={errors.entityType}>
                      <Select value={entityType} onChange={setEntityType} error={errors.entityType}>
                        <option value="">— Select entity type —</option>
                        {ENTITY_TYPES.map((e) => (
                          <option key={e.value} value={e.value}>{e.label}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Nature of Operations (business activity) *" error={errors.operations}>
                      <Select value={operations} onChange={setOperations} error={errors.operations}>
                        <option value="">— Select nature of operations —</option>
                        {OPERATIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </Select>
                      {operationConfig && <NoteBox>{operationConfig.note}</NoteBox>}
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Official Email ID (for the DGFT OTP) *" error={errors.email}>
                      <Input value={email} onChange={setEmail} placeholder="name@example.com" error={errors.email} type="email" />
                    </Field>
                    <Field label="Official Mobile Number (for the DGFT OTP) *" error={errors.phone}>
                      <Input value={phone} onChange={setPhone} placeholder="9876543210" maxLength={10} error={errors.phone} />
                    </Field>
                  </div>
                </Section>
              )}

              {/* STEP 2 — BANK */}
              {stepKey === "bank" && (
                <Section
                  title="Official Bank Account Details"
                  desc="The current account DGFT links to the IEC. Either upload proof of it or type the details."
                >
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
                      subtitle="Type the account holder, bank, branch, account number and IFSC."
                    />
                  </div>
                  {errors.bankMode && <p className="text-[11px] text-destructive font-medium">{errors.bankMode}</p>}

                  {bankMode === "upload" && (
                    <NoteBox>
                      Nothing to upload here — a slot for the cancelled cheque / bank statement is added
                      to your document checklist and opens when you submit.
                    </NoteBox>
                  )}

                  {bankMode === "manual" && (
                    <div className="space-y-4 pt-1">
                      <Field label="Account Holder Name *" error={errors.accountHolder}>
                        <Input value={accountHolder} onChange={setAccountHolder} placeholder="Exactly as it appears on the account" error={errors.accountHolder} />
                      </Field>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Bank Name *" error={errors.bankName}>
                          <Input value={bankName} onChange={setBankName} placeholder="e.g. HDFC Bank" error={errors.bankName} />
                        </Field>
                        <Field label="Branch Name *" error={errors.branchName}>
                          <Input value={branchName} onChange={setBranchName} placeholder="e.g. Banjara Hills" error={errors.branchName} />
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Account Number *" error={errors.accountNumber}>
                          <Input value={accountNumber} onChange={setAccountNumber} placeholder="Current account number" error={errors.accountNumber} />
                        </Field>
                        <Field label="IFSC Code *" error={errors.ifsc}>
                          <Input value={ifsc} onChange={(v) => setIfsc(v.toUpperCase())} placeholder="11-character code" maxLength={11} error={errors.ifsc} />
                        </Field>
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* STEP 3 — SIGNATORY */}
              {stepKey === "signatory" && (
                <Section
                  title={`${signatoryTitle} Details`}
                  desc="The person who signs the IEC application. Their designation options follow the firm type you picked in step 1."
                >
                  <Field label="Full Name of the Authorised Signatory *" error={errors.signatoryName}>
                    <Input value={signatoryName} onChange={setSignatoryName} placeholder="Name as per PAN" error={errors.signatoryName} />
                  </Field>

                  <Field label="Designation / Title *" error={errors.designation}>
                    <Select
                      value={designation}
                      onChange={setDesignation}
                      error={errors.designation}
                      disabled={designations.length === 0}
                    >
                      <option value="">
                        {designations.length === 0 ? "— Please select the entity type first —" : "— Select designation —"}
                      </option>
                      {designations.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </Select>
                  </Field>

                  <NoteBox>
                    The signatory's Aadhaar, PAN and government ID are collected in your upload
                    checklist — the panel opens when you submit.
                  </NoteBox>
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
                  heading="Estimated IEC Fee Breakdown"
                  unpricedNote="Pricing for IEC isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
                />
              )}

              {/* STEP 6 — SUMMARY */}
              {stepKey === "summary" && (
                <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary">
                      IEC Application Preview
                    </div>
                    <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning font-semibold">
                      READY TO SUBMIT
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Firm / Entity</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{firmName || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Entity Type</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{entityLabel || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Nature of Operations</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{operationConfig?.label || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Official Email</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{email || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Official Mobile</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">{phone || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Authorised Signatory</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{signatoryName || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Designation</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{designation || "—"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Bank Details</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {bankMode === "manual"
                          ? `${bankName} · ${branchName} · A/c ending ${accountNumber.slice(-4) || "—"} · ${ifsc.toUpperCase()}`
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
            { label: "Entity Type", value: entityLabel },
            { label: "Nature of Operations", value: operationConfig?.label ?? "" },
          ]}
          professionalFee={professionalFee}
          gstPercent={FEE_FALLBACK.gstPercent}
          formNo="ANF-2A"
          certificates={IEC_CERTIFICATES}
        />
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="iec"
        serviceTitle="IEC (Importer-Exporter Code) Registration"
        authority="DGFT"
        form="ANF-2A"
        initialEmail={email}
        initialPhone={phone}
        formData={{
          firmName,
          entityType,
          entityTypeLabel: entityLabel,
          natureOfOperations: operationConfig?.label ?? operations,
          officialEmail: email,
          officialPhone: phone,
          bankMode,
          ...(bankMode === "manual"
            ? { accountHolder, bankName, branchName, accountNumber, ifsc: ifsc.toUpperCase() }
            : {}),
          signatoryName,
          designation,
        }}
        documents={documents}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your IEC registration — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/iec"
      />
    </div>
  );
}
