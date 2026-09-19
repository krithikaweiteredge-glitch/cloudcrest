import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Percent,
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
  WizardActions,
  WizardHero,
  WizardSidebar,
  downloadSummaryPdf,
  fetchProfileContact,
  format10DigitPhone,
} from "@/components/wizard-ui";

/**
 * IMB Certificate under Section 140 — source: the client's "80IAC.docx".
 *
 * Section 140 of the Income-tax Act, 2025 replaced Section 80-IAC of the 1961
 * Act, so the service is named for it and lives at `section-140` (the old
 * `80iac` URL redirects — see `LEGACY_SLUG_REDIRECTS` in lib/modules).
 *
 * The document's registration workflow is a single tab, which becomes the first
 * step here:
 *
 *   Tab 1 — Enterprise name, type of organisation (Company or LLP) and the
 *           contact person's name, email and mobile.
 *
 * The type of organisation picks the checklist. The document gives a separate
 * "For companies" and "For LLP's" list, and only the LLP list carries the two
 * declarations (splitting up / reconstruction, and plant & machinery) — that is
 * reproduced exactly as written, and mirrors
 * `backend/src/config/section140Catalog.ts`; keep the two in sync.
 *
 * Like the catalog's flat checklist, this per-type split is deliberately NOT run
 * through resolveDocuments(): a catalog row holds one list and cannot express
 * the Company / LLP split. The page copy and the fee still come from the admin's
 * row — see `resolveFees` below.
 */

const STEPS = [
  { key: "enterprise", label: "Applicant & Contact" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const HIGHLIGHTS = [
  { icon: Percent, label: "100% Deduction of Profits" },
  { icon: Rocket, label: "Any 3 of the First 10 Years" },
  { icon: ShieldCheck, label: "Inter-Ministerial Board Certified" },
];

const CERTIFICATES = ["IMB Certificate of Eligible Business (Section 140)"];

type OrgType = "Company" | "LLP";

/**
 * The document's "Documents Required" workflow lists, verbatim. The two
 * declarations appear only on the LLP list and are left there — the document is
 * the specification.
 */
const DOCS: Record<OrgType, string[]> = {
  Company: [
    "Certificate of Incorporation",
    "DPIIT Recognition Certificate",
    "Memorandum of Association",
    "Details of directors and shareholding pattern",
    "Certificate from a Chartered Accountant",
    "Business plan / pitch deck explaining the innovation and scalability",
    "Audited financial statements (if available)",
    "Employees Declaration",
    "Details of products / services and intellectual property (if any)",
  ],
  LLP: [
    "LLP Registration Certificate",
    "DPIIT Recognition Certificate",
    "LLP Agreement",
    "Details of partners",
    "Certificate from a Chartered Accountant",
    "Business plan / pitch deck explaining the innovation and scalability",
    "Audited financial statements (if available)",
    "Employees Declaration",
    "Details of products / services and intellectual property (if any)",
    "Declaration that the start-up is not formed by splitting up or reconstruction of an existing business",
    "Declaration regarding plant & machinery (not transferred from earlier business)",
  ],
};

/**
 * The document's price — ₹9,999 professional fee plus GST @ 18% (₹1,799) — kept
 * only as the fallback for an unpriced row. The catalog's fee lines win.
 */
const FEE_FALLBACK = { professional: 9999, govt: 0, gstPercent: 18 };

/**
 * Module entry point — the tabbed service page is the landing view and "Start
 * Application" swaps it for the stepper, the same shape as LUT / DIN.
 */
export function Section140Module({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <Section140Wizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug="section-140" onStartApplication={() => setApplying(true)} />;
}

export function Section140Wizard({
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
  const [orgType, setOrgType] = useState<OrgType | "">("");
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

  const { service, loading: catalogLoading } = useCatalogService("section-140");

  const authority =
    service?.authority && service.authority !== "—" ? service.authority : "CBDT / DPIIT";
  const form = service?.form && service.form !== "—" ? service.form : "IMB Certificate";

  // The price is the admin's, not this file's — FEE_FALLBACK only covers an
  // unpriced row.
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
    add("enterpriseName", "Name of the Enterprise", enterpriseName);
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
      if (!enterpriseName.trim()) fail("enterpriseName", "Name of the enterprise is required.");
      if (!orgType) fail("orgType", "Tell us whether the start-up is a Company or an LLP.");
      if (!contactName.trim()) fail("contactName", "Contact person name is required.");
      if (!EMAIL_RE.test(email.trim()))
        fail("email", "Enter a valid email address — updates on the IMB application are sent here.");
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
        title: "IMB Certificate (Section 140)",
        authority,
        form,
        fees: fees.lines,
        total: fees.total,
        documents,
        details: answers.map((a) => ({ label: a.label, value: a.value })),
      },
      `Section_140_${(enterpriseName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <div>
      <WizardHero
        eyebrow="Income Tax · Inter-Ministerial Board"
        title="IMB Certificate (Section 140)"
        blurb="Guided Cloudcrest BM workspace for the Inter-Ministerial Board certificate an eligible start-up needs to claim the 100% deduction under Section 140 of the Income-tax Act, 2025 — the erstwhile Section 80-IAC."
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
                Section 140 (IMB) Application
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
                  desc="The start-up applying for the IMB certificate, and who we should reach about it."
                >
                  <Field label="Name of the Enterprise *" error={errors.enterpriseName}>
                    <Input
                      value={enterpriseName}
                      onChange={setEnterpriseName}
                      placeholder="As on the Certificate of Incorporation / LLP registration"
                      error={errors.enterpriseName}
                    />
                  </Field>

                  <Field label="Type of Organisation *" error={errors.orgType}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <OptionCard
                        active={orgType === "Company"}
                        onClick={() => {
                          setOrgType("Company");
                          setStepError(null);
                        }}
                        title="Company"
                        subtitle="Private Limited Company — Certificate of Incorporation and MoA."
                      />
                      <OptionCard
                        active={orgType === "LLP"}
                        onClick={() => {
                          setOrgType("LLP");
                          setStepError(null);
                        }}
                        title="LLP"
                        subtitle="Limited Liability Partnership — LLP registration certificate and agreement."
                      />
                    </div>
                  </Field>

                  {orgType && (
                    <NoteBox>
                      <span className="font-semibold text-foreground">
                        {orgType === "LLP" ? "LLP · " : "Company · "}
                      </span>
                      {documents.length} documents are collected when you submit, including{" "}
                      {orgType === "LLP"
                        ? "the LLP agreement, details of partners and the two declarations on reconstruction and plant & machinery."
                        : "the Memorandum of Association and the details of directors and shareholding."}
                    </NoteBox>
                  )}

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
                        label="Contact Person Mail *"
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
                        label="Contact Person Mobile *"
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
                  heading="IMB Certificate (Section 140) — Fee Breakdown"
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
                      <div className="text-xs font-semibold">
                        Documents to upload {orgType ? `· for ${orgType === "LLP" ? "LLPs" : "companies"}` : ""}
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
            { label: "Service", value: "IMB Certificate (Section 140)" },
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
        serviceSlug="section-140"
        serviceTitle="IMB Certificate (Section 140)"
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
        reason="Sign in to continue your Section 140 (IMB) application — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/section-140"
      />
    </div>
  );
}
