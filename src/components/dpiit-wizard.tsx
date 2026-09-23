import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Rocket,
  ShieldCheck,
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
  NoteBox,
  OptionCard,
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
 * Startup India / DPIIT Recognition — source: the client's
 * "DPIIT CHANGES.docx".
 *
 * Unlike the other client documents this session worked from, this one gives
 * no About / Who can Apply narrative — only a two-tab registration workflow,
 * a documents list and a fee. The existing `dpiit` catalog row is left with
 * whatever About / Who can Apply copy it already has (none, as of writing);
 * only its documents and price were revised (see
 * `backend/src/config/dpiitCatalog.ts` and `scripts/backfill-dpiit.ts`).
 *
 * The document's registration workflow is two tabs, which become the first
 * two steps here:
 *
 *   Tab 1 — Enterprise name, type of enterprise (five types) and the
 *           authorised person's name, mobile and email.
 *   Tab 2 — Business type (Manufacturer / Service Provider / Both), number of
 *           employees, and business details.
 *
 * The document's documents list isn't fully split by enterprise type — most
 * entries apply to everyone, and only three are scoped to one type each (MOA
 * & AOA for a Company, LLP Agreement for an LLP, Partnership Deed for a
 * Partnership). `DOCS` below reflects that split; mirrors
 * `backend/src/config/dpiitCatalog.ts` — keep the two in sync.
 */

const STEPS = [
  { key: "enterprise", label: "Enterprise & Authorised Person" },
  { key: "business", label: "Business Details" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const HIGHLIGHTS = [
  { icon: Rocket, label: "DPIIT Recognition Certificate" },
  { icon: ShieldCheck, label: "Tax & Funding Benefits" },
];

const CERTIFICATES = ["Startup India / DPIIT Recognition Certificate"];

const ORG_TYPES = ["Company", "LLP", "Partnership", "Cooperative", "Sole Proprietor"] as const;
type OrgType = (typeof ORG_TYPES)[number];

/** Documents common to every enterprise type. */
const COMMON_DOCS = [
  "UDYAM Certificate",
  "GST Certificate",
  "Website Link",
  "Pitch Deck about Business",
  "Company Logo",
  "IPR documents (Patent / Trademark / Copyright filing receipts or certificates), if any",
];

/** The per-type documents from the document's checklist, added to the common set. */
const DOCS: Record<OrgType, string[]> = {
  Company: [
    ...COMMON_DOCS,
    "Certificate of Incorporation",
    "Directors' Mail and Mobile",
    "MOA & AOA",
  ],
  LLP: [
    ...COMMON_DOCS,
    "Certificate of Incorporation",
    "Directors' Mail and Mobile",
    "LLP Agreement",
  ],
  Partnership: [...COMMON_DOCS, "Partnership Deed"],
  Cooperative: COMMON_DOCS,
  "Sole Proprietor": COMMON_DOCS,
};

/** Tab 2's business type question. */
const BUSINESS_TYPES = ["Manufacturer", "Service Provider", "Both"] as const;
type BusinessType = (typeof BUSINESS_TYPES)[number];

/**
 * The document's price — ₹9,999 professional fee plus GST @ 18% (₹1,800) —
 * kept only as the fallback for an unpriced row. The catalog's fee lines win.
 */
const FEE_FALLBACK = { professional: 9999, govt: 0, gstPercent: 18 };

/**
 * Module entry point — the tabbed service page is the landing view and "Start
 * Application" swaps it for the stepper, the same shape as Section 332 / 354.
 */
export function DpiitModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <DpiitWizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug="dpiit" onStartApplication={() => setApplying(true)} />;
}

export function DpiitWizard({
  initialName,
  onBack: onExit,
}: {
  initialName?: string;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Tab 1
  const [enterpriseName, setEnterpriseName] = useState(initialName ?? "");
  const [orgType, setOrgType] = useState<OrgType | "">("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  // Tab 2 — business details.
  const [businessType, setBusinessType] = useState<BusinessType | "">("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [businessDetails, setBusinessDetails] = useState("");

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

  const { service, loading: catalogLoading } = useCatalogService("dpiit");

  const authority = service?.authority && service.authority !== "—" ? service.authority : "DPIIT";
  const form = service?.form && service.form !== "—" ? service.form : "Recognition";

  const fees = resolveFees(service, authority, FEE_FALLBACK);
  const professionalFee =
    fees.lines.find((l) => /professional/i.test(l.label))?.amount || FEE_FALLBACK.professional;

  const documents = useMemo(() => (orgType ? DOCS[orgType] : []), [orgType]);

  const stepKey = STEPS[step]?.key;

  /** What is stored with the request and printed on the summary. */
  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string }[] = [];
    const add = (key: string, label: string, value: string) => {
      const v = value.trim();
      if (v) rows.push({ key, label, value: v });
    };
    add("enterpriseName", "Enterprise Name", enterpriseName);
    add("orgType", "Type of Enterprise", orgType);
    add("authorisedName", "Authorised Person Name", contactName);
    add("authorisedEmail", "Authorised Person Email", email);
    add("authorisedMobile", "Authorised Person Mobile", mobile);
    add("businessType", "Business Type", businessType);
    add("employeeCount", "Number of Employees", employeeCount);
    add("businessDetails", "Business Details", businessDetails);
    return rows;
  }, [
    enterpriseName,
    orgType,
    contactName,
    email,
    mobile,
    businessType,
    employeeCount,
    businessDetails,
  ]);

  const validateStep = (key: string | undefined): boolean => {
    const e: Record<string, string> = {};
    let first: string | null = null;
    const fail = (field: string, msg: string) => {
      e[field] = msg;
      if (!first) first = msg;
    };

    if (key === "enterprise") {
      if (!enterpriseName.trim()) fail("enterpriseName", "Enterprise name is required.");
      if (!orgType) fail("orgType", "Select the type of enterprise.");
      if (!contactName.trim()) fail("contactName", "Authorised person's name is required.");
      if (!EMAIL_RE.test(email.trim()))
        fail("email", "Enter a valid email address — OTPs are sent here.");
      if (!IN_MOBILE_RE.test(mobile.trim()))
        fail("mobile", "Enter a valid 10-digit mobile number — OTPs are sent here.");
    }

    if (key === "business") {
      if (!businessType) fail("businessType", "Select what the enterprise does.");
      if (!employeeCount.trim() || Number(employeeCount) < 0)
        fail("employeeCount", "Enter the number of employees.");
      if (!businessDetails.trim()) fail("businessDetails", "Describe the business in a few lines.");
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
        title: "Startup India / DPIIT Recognition",
        authority,
        form,
        fees: fees.lines,
        total: fees.total,
        documents,
        details: answers.map((a) => ({ label: a.label, value: a.value })),
      },
      `DPIIT_${(enterpriseName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <div>
      <WizardHero
        eyebrow="DPIIT · Startup India"
        title="Startup India / DPIIT Recognition"
        blurb="Guided Cloudcrest BM workspace for DPIIT recognition under Startup India — the certificate that unlocks tax exemptions, easier compliance and funding access for your startup."
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
              <div className="label-eyebrow mb-2 text-primary">Startup India · {authority}</div>
              <h2 className="text-2xl font-semibold tracking-tight">
                DPIIT Recognition Application
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
              {/* STEP 1 — TAB 1 */}
              {stepKey === "enterprise" && (
                <Section
                  title="Enterprise & Authorised Person"
                  desc="The startup applying for DPIIT recognition, and who signs on its behalf."
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
                    label="Type of Enterprise *"
                    error={errors.orgType}
                    hint="The type decides the documents asked for at submission."
                  >
                    <Select
                      value={orgType}
                      onChange={(v) => setOrgType(v as OrgType | "")}
                      error={errors.orgType}
                    >
                      <option value="">-- Select --</option>
                      {ORG_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <div className="pt-2 border-t border-border space-y-4">
                    <Field label="Authorised Person Name *" error={errors.contactName}>
                      <Input
                        value={contactName}
                        onChange={setContactName}
                        error={errors.contactName}
                      />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field
                        label="Mobile (for OTPs) *"
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
                      <Field
                        label="Mail (for OTPs) *"
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
                    </div>
                  </div>
                </Section>
              )}

              {/* STEP 2 — TAB 2 */}
              {stepKey === "business" && (
                <Section title="Business Details" desc="What the startup does, and how big it is.">
                  <Field label="Business Type *" error={errors.businessType}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {BUSINESS_TYPES.map((t) => (
                        <OptionCard
                          key={t}
                          active={businessType === t}
                          onClick={() => {
                            setBusinessType(t);
                            setStepError(null);
                          }}
                          title={t}
                          subtitle=""
                        />
                      ))}
                    </div>
                  </Field>

                  <Field label="Number of Employees *" error={errors.employeeCount}>
                    <Input
                      type="number"
                      value={employeeCount}
                      onChange={setEmployeeCount}
                      placeholder="e.g. 5"
                      error={errors.employeeCount}
                    />
                  </Field>

                  <Field label="Business Details *" error={errors.businessDetails}>
                    <Input
                      value={businessDetails}
                      onChange={setBusinessDetails}
                      placeholder="What the enterprise does — innovation, product or service"
                      error={errors.businessDetails}
                    />
                  </Field>

                  {orgType && (
                    <NoteBox>
                      <span className="font-semibold text-foreground">{orgType} · </span>
                      {documents.length} documents are collected when you submit.
                    </NoteBox>
                  )}
                </Section>
              )}

              {/* STEP 3 — FEES, AS PUBLISHED IN ADMIN → SERVICES */}
              {stepKey === "fees" && (
                <FeesStep
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                  loading={catalogLoading}
                  lines={fees.lines}
                  total={fees.total}
                  heading="DPIIT Recognition — Fee Breakdown"
                  unpricedNote="Pricing for this service isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
                />
              )}

              {/* STEP 4 — SUMMARY */}
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
                      <div className="text-xs font-semibold">
                        Documents to upload {orgType ? `· ${orgType}` : ""}
                      </div>
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
            { label: "Service", value: "Startup India / DPIIT Recognition" },
            { label: "Enterprise", value: enterpriseName },
            { label: "Type of Enterprise", value: orgType },
            { label: "Business Type", value: businessType },
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
        serviceSlug="dpiit"
        serviceTitle="Startup India / DPIIT Recognition"
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
        reason="Sign in to continue your DPIIT recognition application — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/dpiit"
      />
    </div>
  );
}
