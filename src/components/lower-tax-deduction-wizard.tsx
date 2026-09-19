import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Percent,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { ServiceDetailPage } from "@/components/service-detail-page";
import { useAuth } from "@/hooks/use-auth";
import { useCatalogService, resolveDocuments, resolveFees } from "@/lib/service-catalog";
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
 * Lower Tax Deduction Certificate — source: the client's
 * "Lower Tax Deduction.docx".
 *
 * The document's registration flow is a single tab, which becomes the first
 * step here:
 *
 *   Tab 1 — Enterprise name, type of organisation (the seven kinds the "Who can
 *           Apply" list names) and the contact person's name, email and mobile.
 *
 * Everything else on the page — About, Who can Apply, the document checklist
 * and Acts & Rules — is admin content: it lives on the `lower-tax-deduction`
 * catalog row (written there once from `backend/src/config/lowerTaxDeductionCatalog.ts`)
 * and the service page renders whatever the admin has published.
 *
 * The fee is admin content too. The document prices this at ₹6,999 + ₹1,260 GST
 * and the backfill writes exactly that, but the wizard never prints those
 * numbers from code: `resolveFees` reads the row's fee lines, so repricing in
 * Admin → Services is all it takes. FEE_FALLBACK below is only what is shown if
 * the row is somehow unpriced.
 */

const STEPS = [
  { key: "enterprise", label: "Applicant & Contact" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const HIGHLIGHTS = [
  { icon: Percent, label: "Nil / Lower TDS Rate" },
  { icon: Wallet, label: "No Waiting on Refunds" },
  { icon: ShieldCheck, label: "Binding on Every Deductor" },
];

const CERTIFICATES = ["Lower / Nil Tax Deduction Certificate (TRACES)"];

/** The "Type of organisation" dropdown, verbatim from the document's Tab 1. */
const ORG_TYPES = [
  "Individuals",
  "Hindu Undivided Families",
  "Partnership firms",
  "LLP",
  "Companies",
  "Trust and charitable Institutions",
  "Non-Residents",
];

/**
 * The document's "Documents required" list, used only until the catalog row has
 * its own checklist — `resolveDocuments` prefers the admin's list. Keep in sync
 * with `backend/src/config/lowerTaxDeductionCatalog.ts`.
 */
const FALLBACK_DOCUMENTS = [
  "PAN of the applicant",
  "TRACES portal login credentials",
  "Computation of estimated total income and tax liability for the current Tax Year",
  "Income Tax Returns (ITRs) of the preceding four Tax Years (or computation of income if ITR was not filed for any year)",
  "Details of TDS already deducted in the current year (Form 26AS / AIS)",
  "List of deductors with their TAN, nature of payment and estimated amount",
  "Projected Profit & Loss Account and Balance Sheet (in case of business/profession)",
  "Copy of contracts / agreements / invoices under which payments are being received",
  "Registration / exemption certificate (if claiming exemption)",
  "Details of advance tax paid",
];

/**
 * The document's price — ₹6,999 professional fee plus GST @ 18% (₹1,260) — kept
 * only as the fallback for an unpriced row. The catalog's fee lines win.
 */
const FEE_FALLBACK = { professional: 6999, govt: 0, gstPercent: 18 };

/**
 * Module entry point — the tabbed service page is the landing view and "Start
 * Application" swaps it for the stepper, the same shape as LUT / DIN.
 */
export function LowerTaxDeductionModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <LowerTaxDeductionWizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return (
    <ServiceDetailPage slug="lower-tax-deduction" onStartApplication={() => setApplying(true)} />
  );
}

export function LowerTaxDeductionWizard({
  initialName,
  onBack: onExit,
}: {
  initialName?: string;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Tab 1 — the whole form the document specifies.
  const [enterpriseName, setEnterpriseName] = useState(initialName ?? "");
  const [orgType, setOrgType] = useState("");
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

  const { service, loading: catalogLoading } = useCatalogService("lower-tax-deduction");

  const authority =
    service?.authority && service.authority !== "—" ? service.authority : "Income Tax";
  const form = service?.form && service.form !== "—" ? service.form : "128";

  // Fees and the checklist both come from the admin's catalog row; the
  // document's own values are only the fallback.
  const fees = resolveFees(service, authority, FEE_FALLBACK);
  const professionalFee =
    fees.lines.find((l) => /professional/i.test(l.label))?.amount || FEE_FALLBACK.professional;
  const { documents } = resolveDocuments(service, FALLBACK_DOCUMENTS);

  const stepKey = STEPS[step]?.key;

  /** What is stored with the request and printed on the summary. */
  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string }[] = [];
    const add = (key: string, label: string, value: string) => {
      const v = value.trim();
      if (v) rows.push({ key, label, value: v });
    };
    add("enterpriseName", "Enterprise Name", enterpriseName);
    add("orgType", "Type of Organisation", orgType);
    add("contactName", "Contact Person Name", contactName);
    add("contactEmail", "Contact Person Email", email);
    add("contactPhone", "Contact Person Mobile", mobile);
    return rows;
  }, [enterpriseName, orgType, contactName, email, mobile]);

  const validateStep = (key: string | undefined): boolean => {
    const e: Record<string, string> = {};
    let first: string | null = null;
    const fail = (field: string, msg: string) => {
      e[field] = msg;
      if (!first) first = msg;
    };

    if (key === "enterprise") {
      if (!enterpriseName.trim()) fail("enterpriseName", "Enterprise name is required.");
      if (!orgType) fail("orgType", "Select the type of organisation applying.");
      if (!contactName.trim()) fail("contactName", "Contact person name is required.");
      if (!EMAIL_RE.test(email.trim()))
        fail("email", "Enter a valid email address — the department's updates are sent here.");
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
        title: "Lower Tax Deduction Certificate",
        authority,
        form,
        fees: fees.lines,
        total: fees.total,
        documents,
        details: answers.map((a) => ({ label: a.label, value: a.value })),
      },
      `Lower_Tax_Deduction_${(enterpriseName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <div>
      <WizardHero
        eyebrow="Income Tax · Form No. 128"
        title="Lower Tax Deduction Certificate"
        blurb="Guided Cloudcrest BM workspace for a Nil / Lower TDS certificate under Section 395(1) of the Income-tax Act, 2025 — so tax is deducted at the rate your actual liability justifies instead of the standard one."
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
                Lower Tax Deduction Application
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
              {stepKey === "enterprise" && (
                <Section
                  title="Applicant & Contact Details"
                  desc="Who the certificate is for, and who the department should reach about it."
                >
                  <Field label="Enterprise Name *" error={errors.enterpriseName}>
                    <Input
                      value={enterpriseName}
                      onChange={setEnterpriseName}
                      placeholder="As it appears on the PAN"
                      error={errors.enterpriseName}
                    />
                  </Field>

                  <Field
                    label="Type of Organisation *"
                    error={errors.orgType}
                    hint="Anyone whose income is subject to TDS can apply — the type decides which financials the Assessing Officer asks for."
                  >
                    <Select value={orgType} onChange={setOrgType} error={errors.orgType}>
                      <option value="">-- Select --</option>
                      {ORG_TYPES.map((t) => (
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
                        label="Contact Person Email ID *"
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
                  heading="Lower Tax Deduction Certificate — Fee Breakdown"
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
                        <dt className="text-muted-foreground">Form</dt>
                        <dd className="font-semibold text-foreground mt-0.5 mono">{form}</dd>
                      </div>
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
                        {documents.length}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {documents.map((d) => (
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
            { label: "Service", value: "Lower Tax Deduction Certificate" },
            { label: "Enterprise", value: enterpriseName },
            { label: "Type of Organisation", value: orgType },
            { label: "Documents", value: String(documents.length) },
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
        serviceSlug="lower-tax-deduction"
        serviceTitle="Lower Tax Deduction Certificate"
        authority={authority}
        form={form}
        documents={documents}
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
        reason="Sign in to continue your Lower Tax Deduction application — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/lower-tax-deduction"
      />
    </div>
  );
}
