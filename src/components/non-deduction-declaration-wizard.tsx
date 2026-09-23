import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { ServiceDetailPage } from "@/components/service-detail-page";
import { useAuth } from "@/hooks/use-auth";
import { useCatalogService, resolveFees } from "@/lib/service-catalog";
import {
  EMAIL_RE,
  Field,
  FeesStep,
  IN_MOBILE_RE,
  Input,
  Section,
  Select,
  WizardActions,
  WizardHero,
  WizardSidebar,
  downloadSummaryPdf,
  fetchProfileContact,
  format10DigitPhone,
} from "@/components/wizard-ui";

/**
 * Declaration for Non-Deduction of Tax — source: the client's "Declaration of
 * non deduction of tax.docx".
 *
 * Filed in Form No. 121 under Section 393(6) of the Income-tax Act, 2025. It
 * replaces the old Form 15G / Form 15H: a self-declaration to a payer (bank,
 * company, etc.) that the declarant's estimated tax liability for the Tax Year
 * is Nil, so no TDS should be deducted.
 *
 * The document's registration flow is a single tab, which becomes the first
 * step here:
 *
 *   Tab 1 — Name of the declarant, type of person (three options) and the
 *           contact person's name, email and mobile.
 *
 * Unlike the org-type wizards this session has built, the document gives ONE
 * document checklist that applies to every type of person — the type only
 * decides eligibility (only residents, individual or HUF, may file this), not
 * the paperwork. So there is no per-type document split here.
 *
 * Mirrors `backend/src/config/nonDeductionDeclarationCatalog.ts`; keep the two
 * in sync.
 */

const STEPS = [
  { key: "declarant", label: "Declarant & Contact" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const HIGHLIGHTS = [
  { icon: Wallet, label: "Replaces Form 15G / 15H" },
  { icon: ShieldCheck, label: "Nil TDS on Specified Income" },
];

const CERTIFICATES = ["Acknowledged Form 121 declaration"];

/** Tab 1's "Type of person" dropdown, verbatim. */
const PERSON_TYPES = [
  "Resident Individual (below 60 years)",
  "Resident Individual (60 years and above)",
  "Resident Hindu Undivided Family (HUF)",
] as const;

/**
 * The submit-time checklist — the same for every declarant type. Mirrors the
 * catalog's `NON_DEDUCTION_DECLARATION_APPLICATION_DOCUMENTS`, which is the
 * general Documents list plus "Income Tax portal login credentials" (asked in
 * the document's own Tab 1 workflow section).
 */
const DOCUMENTS = [
  "PAN of the applicant",
  "Details of the income / investment for which non-deduction is sought (FD number, account number, etc.)",
  "Name, address and TAN of the payer",
  "Income Tax portal login credentials",
  "Bank account / investment details",
];

/** The form this declaration is filed on. */
const FORM = "Form 121";

/**
 * The document's price — ₹999 professional fee plus GST @ 18% (₹180) — kept
 * only as the fallback for an unpriced row. The catalog's fee lines win.
 */
const FEE_FALLBACK = { professional: 999, govt: 0, gstPercent: 18 };

/**
 * Module entry point — the tabbed service page is the landing view and "Start
 * Application" swaps it for the stepper, the same shape as Section 332 / ICE GATE.
 */
export function NonDeductionDeclarationModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return (
      <NonDeductionDeclarationWizard initialName={initialName} onBack={() => setApplying(false)} />
    );
  }
  return (
    <ServiceDetailPage
      slug="non-deduction-declaration"
      onStartApplication={() => setApplying(true)}
    />
  );
}

export function NonDeductionDeclarationWizard({
  initialName,
  onBack: onExit,
}: {
  initialName?: string;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  const [declarantName, setDeclarantName] = useState(initialName ?? "");
  const [personType, setPersonType] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setEmail((prev) => prev || user.email || "");
    setMobile((prev) => prev || format10DigitPhone(user.phone));
    fetchProfileContact().then((c) => {
      if (!c) return;
      setEmail((prev) => prev || c.email || user.email || "");
      setMobile((prev) => prev || c.phone || format10DigitPhone(user.phone));
    });
  }, [user]);

  const { service, loading: catalogLoading } = useCatalogService("non-deduction-declaration");

  const authority =
    service?.authority && service.authority !== "—" ? service.authority : "Income Tax";
  const form = service?.form && service.form !== "—" ? service.form : FORM;

  const fees = resolveFees(service, authority, FEE_FALLBACK);
  const professionalFee =
    fees.lines.find((l) => /professional/i.test(l.label))?.amount || FEE_FALLBACK.professional;

  const stepKey = STEPS[step]?.key;

  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string }[] = [];
    const add = (key: string, label: string, value: string) => {
      const v = value.trim();
      if (v) rows.push({ key, label, value: v });
    };
    add("declarantName", "Name of the Declarant", declarantName);
    add("personType", "Type of Person", personType);
    add("contactName", "Contact Person Name", contactName);
    add("contactEmail", "Contact Person Email", email);
    add("contactPhone", "Contact Person Mobile", mobile);
    return rows;
  }, [declarantName, personType, contactName, email, mobile]);

  const validateStep = (key: string | undefined): boolean => {
    const e: Record<string, string> = {};
    let first: string | null = null;
    const fail = (field: string, msg: string) => {
      e[field] = msg;
      if (!first) first = msg;
    };

    if (key === "declarant") {
      if (!declarantName.trim()) fail("declarantName", "Name of the declarant is required.");
      if (!personType) fail("personType", "Select the type of person filing the declaration.");
      if (!contactName.trim()) fail("contactName", "Contact person name is required.");
      if (!EMAIL_RE.test(email.trim()))
        fail("email", "Enter a valid email address — updates on the declaration are sent here.");
      if (!IN_MOBILE_RE.test(mobile.trim()))
        fail("mobile", "Enter a valid 10-digit mobile number — OTPs are sent here.");
    }

    setErrors(e);
    setStepError(first);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!user) {
      setOpenSignIn(true);
      return;
    }
    if (validateStep(stepKey)) {
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

  const formData = Object.fromEntries(answers.map((a) => [a.key, a.value]));

  const onDownload = () =>
    downloadSummaryPdf(
      {
        title: "Declaration for Non-Deduction of Tax",
        authority,
        form,
        fees: fees.lines,
        total: fees.total,
        documents: DOCUMENTS,
        details: answers.map((a) => ({ label: a.label, value: a.value })),
      },
      `Non_Deduction_Declaration_${(declarantName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <div>
      <WizardHero
        eyebrow="Income Tax · Form 121"
        title="Declaration for Non-Deduction of Tax"
        blurb="Guided Cloudcrest BM workspace for Form 121 — the self-declaration to a payer that your estimated tax liability for the Tax Year is Nil, so TDS is not deducted. Replaces the old Form 15G / 15H."
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
                <ArrowLeft className="size-3.5" /> Back to service details
              </button>
            )}

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">IT Act, 2025 · {authority}</div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Non-Deduction Declaration Application
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

            <div key={step} className="mt-6 space-y-6">
              {/* STEP 1 — THE DOCUMENT'S TAB 1 */}
              {stepKey === "declarant" && (
                <Section
                  title="Declarant & Contact Details"
                  desc="Who is declaring Nil tax liability, and who we should reach about it."
                >
                  <Field label="Name of the Declarant *" error={errors.declarantName}>
                    <Input
                      value={declarantName}
                      onChange={setDeclarantName}
                      placeholder="As it appears on the PAN"
                      error={errors.declarantName}
                    />
                  </Field>

                  <Field
                    label="Type of Person *"
                    error={errors.personType}
                    hint="Only resident individuals and resident HUFs can file this declaration."
                  >
                    <Select value={personType} onChange={setPersonType} error={errors.personType}>
                      <option value="">-- Select --</option>
                      {PERSON_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <div className="pt-2 border-t border-border space-y-4">
                    <Field label="Contact Person Name *" error={errors.contactName}>
                      <Input
                        value={contactName}
                        onChange={setContactName}
                        error={errors.contactName}
                      />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field
                        label="Contact Person Email *"
                        error={errors.email}
                        hint="Use an email you can access — OTPs are sent here."
                      >
                        <Input
                          type="email"
                          value={email}
                          onChange={setEmail}
                          placeholder="name@example.com"
                          error={errors.email}
                        />
                      </Field>
                      <Field
                        label="Contact Person Mobile Number *"
                        error={errors.mobile}
                        hint="Use a number you can access — OTPs are sent here."
                      >
                        <Input
                          value={mobile}
                          onChange={(v) => setMobile(v.replace(/\D/g, "").slice(0, 10))}
                          placeholder="10-digit mobile"
                          maxLength={10}
                          error={errors.mobile}
                        />
                      </Field>
                    </div>
                  </div>
                </Section>
              )}

              {/* STEP 2 — FEES, AS PUBLISHED IN ADMIN → SERVICES */}
              {stepKey === "fees" && (
                <FeesStep
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                  loading={catalogLoading}
                  lines={fees.lines}
                  total={fees.total}
                  heading="Non-Deduction Declaration — Fee Breakdown"
                  unpricedNote="Pricing for this service isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
                />
              )}

              {/* STEP 3 — SUMMARY */}
              {stepKey === "summary" && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <div className="text-xs font-bold uppercase tracking-wider text-primary">
                        Application Preview
                      </div>
                      <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning font-semibold">
                        READY TO SUBMIT
                      </span>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {answers.map((a) => (
                        <div key={a.key}>
                          <dt className="text-muted-foreground">{a.label}</dt>
                          <dd className="font-semibold text-foreground mt-0.5">{a.value}</dd>
                        </div>
                      ))}
                      <div>
                        <dt className="text-muted-foreground">Total Estimated Cost</dt>
                        <dd className="font-semibold text-foreground mt-0.5 mono">
                          {fees.total > 0
                            ? `₹ ${fees.total.toLocaleString("en-IN")}`
                            : "To be confirmed"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-border bg-surface shadow-card p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="size-3.5 text-primary shrink-0" />
                      <div className="text-xs font-semibold">Documents to upload</div>
                      <span className="text-[10px] mono text-muted-foreground ml-auto">
                        {DOCUMENTS.length}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {DOCUMENTS.map((d) => (
                        <li key={d} className="flex items-start gap-2 text-[12px] leading-relaxed">
                          <CheckCircle2 className="size-3.5 text-primary/60 shrink-0 mt-0.5" />
                          <span className="text-foreground/85">{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
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
            { label: "Service", value: "Declaration for Non-Deduction of Tax" },
            { label: "Declarant", value: declarantName },
            { label: "Type of Person", value: personType },
          ]}
          professionalFee={professionalFee}
          gstPercent={service?.gstPercent || FEE_FALLBACK.gstPercent}
          formNo={form}
          certificates={CERTIFICATES}
        />
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="non-deduction-declaration"
        serviceTitle="Declaration for Non-Deduction of Tax"
        authority={authority}
        form={form}
        documents={DOCUMENTS}
        initialName={contactName}
        initialEmail={email}
        initialPhone={mobile}
        formData={formData}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your non-deduction declaration — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/non-deduction-declaration"
      />
    </div>
  );
}
