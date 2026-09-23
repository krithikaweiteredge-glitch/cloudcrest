import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  HeartPulse,
  Landmark,
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
 * Form 104 (the old Form 10A) — source: the client's "Form 140.docx" (the file
 * is misnamed; its content is entirely Form 104 / provisional registration
 * under Section 332(3), not "Form 140").
 *
 * Form 104 is the PROVISIONAL registration under Section 332 — filed only when
 * activities have not yet commenced. An organisation whose activities have
 * already started, or that is renewing/modifying, files Form 105 instead — see
 * the `section-332` service, which already covers that case.
 *
 * The document's registration workflow is a single tab, which becomes the
 * first step here:
 *
 *   Tab 1 — Name of the enterprise, type of organisation and the contact
 *           person's name, email and mobile. The type picks the document
 *           checklist — the document gives one list per type, each keyed to
 *           its own "Nature Code".
 *
 * All of this mirrors `backend/src/config/form10aCatalog.ts`; keep the two in
 * sync. The per-type checklist is deliberately NOT run through
 * resolveDocuments(): a catalog row holds one flat list and cannot express the
 * split. The page copy and the fee come from the admin's row.
 */

const STEPS = [
  { key: "enterprise", label: "Organisation & Contact" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const HIGHLIGHTS = [
  { icon: HeartPulse, label: "Provisional Registration" },
  { icon: Landmark, label: "Section 332(3) of the New Act" },
  { icon: ShieldCheck, label: "Valid up to 3 Tax Years" },
];

const CERTIFICATES = ["Form 106 — Order granting provisional registration"];

const ORG_TYPES = [
  "Public Trust",
  "Society",
  "Sec-8 company",
  "University / Educational Institution",
  "Government Financed Institutions",
] as const;
type OrgType = (typeof ORG_TYPES)[number];

/** The per-type "Documents Required" lists from the document's workflow, one
 *  per Nature Code. */
const DOCS: Record<OrgType, string[]> = {
  "Public Trust": [
    "Self-certified copy of the Trust Deed (must be irrevocable)",
    "Self-certified copy of registration certificate issued by Registrar of Public Trusts / Charity Commissioner (or Sub-Registrar under the relevant State Public Trusts Act)",
    "Confirmation the trust is irrevocable, as required by Section 332(2)(b)",
  ],
  Society: [
    "Self-certified copy of Memorandum of Association (MOA) + Rules & Regulations / Bye-laws",
    "Self-certified copy of registration certificate issued by Registrar of Societies (under Societies Registration Act, 1860 or relevant State law)",
  ],
  "Sec-8 company": [
    "Self-certified copy of Memorandum of Association (MOA) + Articles of Association (AOA)",
    "Self-certified copy of Certificate of Incorporation issued by Registrar of Companies (ROC)",
    "Self-certified copy of Section 8 licence (Form INC-16 or equivalent under Companies Act, 2013)",
  ],
  "University / Educational Institution": [
    "Self-certified copy of the instrument of creation / establishment (e.g., University Act, Act of Parliament/State Legislature, or affiliation/recognition order) — or document evidencing creation, if not created under an instrument",
    "Self-certified copy of registration / recognition / affiliation certificate issued by the competent Government authority / UGC / relevant regulatory body",
  ],
  "Government Financed Institutions": [
    "Self-certified copy of the instrument of creation / establishment, or document evidencing creation",
    "Self-certified copy of registration / recognition certificate",
    "Evidence of Government / local authority financing (e.g., sanction order, grant letter, or notification showing the institution is wholly or partly financed by Government or local authority)",
  ],
};

/** The form this registration is filed on. */
const FORM = "Form 104";

/**
 * The document's price — ₹4,999 professional fee plus GST @ 18% (₹900) — kept
 * only as the fallback for an unpriced row. The catalog's fee lines win.
 */
const FEE_FALLBACK = { professional: 4999, govt: 0, gstPercent: 18 };

/**
 * Module entry point — the tabbed service page is the landing view and "Start
 * Application" swaps it for the stepper, the same shape as Section 332 / Section 354.
 */
export function Form10aModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <Form10aWizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug="form-10a" onStartApplication={() => setApplying(true)} />;
}

export function Form10aWizard({
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

  const { service, loading: catalogLoading } = useCatalogService("form-10a");

  const authority =
    service?.authority && service.authority !== "—" ? service.authority : "Income Tax";

  const form = service?.form && service.form !== "—" ? service.form : FORM;

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
      if (!orgType) fail("orgType", "Select the type of organisation applying.");
      if (!contactName.trim()) fail("contactName", "Contact person name is required.");
      if (!EMAIL_RE.test(email.trim()))
        fail("email", "Enter a valid email address — updates on the application are sent here.");
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
        title: "Form 104 (Provisional Registration)",
        authority,
        form,
        fees: fees.lines,
        total: fees.total,
        documents,
        details: answers.map((a) => ({ label: a.label, value: a.value })),
      },
      `Form_104_${(enterpriseName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <div>
      <WizardHero
        eyebrow="Income Tax e-Filing Portal · Form 104"
        title="Form 104 (Provisional Registration)"
        blurb="Guided Cloudcrest BM workspace for Form 104 — the provisional registration a new, unregistered non-profit files under Section 332(3) of the Income-tax Act, 2025 before its activities have commenced."
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
              <div className="label-eyebrow mb-2 text-primary">
                Income-tax Act, 2025 · {authority}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Form 104 Provisional Registration
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
                  title="Organisation & Contact Details"
                  desc="The new, unregistered organisation applying for provisional registration, and who we should reach about it."
                >
                  <Field label="Name of the Enterprise *" error={errors.enterpriseName}>
                    <Input
                      value={enterpriseName}
                      onChange={setEnterpriseName}
                      placeholder="As on the trust deed / registration certificate"
                      error={errors.enterpriseName}
                    />
                  </Field>

                  <Field
                    label="Type of Organisation *"
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
                        label="Contact Person Mobile No. *"
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
                  heading="Form 104 — Fee Breakdown"
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
            { label: "Service", value: "Form 104 (Provisional Registration)" },
            { label: "Enterprise", value: enterpriseName },
            { label: "Type of Organisation", value: orgType },
            { label: "Documents", value: orgType ? String(documents.length) : "" },
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
        serviceSlug="form-10a"
        serviceTitle="Form 104 (Provisional Registration)"
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
        reason="Sign in to continue your Form 104 application — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/form-10a"
      />
    </div>
  );
}
