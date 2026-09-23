import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, Globe, ShieldCheck } from "lucide-react";
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
 * ICE GATE Registration — source: the client's "ICE GATE.docx". A distinct
 * service from `iec` (the existing DGFT Importer-Exporter Code wizard, built
 * earlier from "IEC updated.html") — the two are priced and filed separately.
 *
 * The document's registration workflow is two tabs, which become the first two
 * steps here:
 *
 *   Tab 1 — Enterprise name, type of organisation (eight types) and the
 *           contact person's name, email and mobile.
 *   Tab 2 — Authorised person's name and designation, what the applicant
 *           intends to do (Import / Export / Both), and the document checklist
 *           for the chosen organisation type.
 *
 * "Trusts and Societies" is one combined dropdown option in the document's Tab
 * 1, though Tab 2 gives Trust and Society separate document lists — the
 * checklist for that entry carries the union of both (see
 * `backend/src/config/icegateCatalog.ts`, which this mirrors — keep the two in
 * sync).
 */

const STEPS = [
  { key: "enterprise", label: "Enterprise & Contact" },
  { key: "authorised", label: "Authorised Person" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const HIGHLIGHTS = [
  { icon: Globe, label: "DGFT Portal Filing" },
  { icon: ShieldCheck, label: "PAN-Linked Registration" },
];

const CERTIFICATES = ["IEC certificate (DGFT)"];

const ORG_TYPES = [
  "Proprietorship",
  "Partnership Firm",
  "LLP",
  "Private Limited Company",
  "Public Limited Company",
  "OPC",
  "Trusts and Societies",
  "HUF",
] as const;
type OrgType = (typeof ORG_TYPES)[number];

const ADDRESS_PROOF_ANY_ONE =
  "Address proof (any one) — Sale deed, Rent/lease agreement, Electricity bill, or Telephone/landline bill";
const BANK_PROOF = "Bank proof — cancelled cheque or bank certificate";
const GST_CERT = "GST Certificate";

/** The per-type "Documents Required" lists from the document's Tab 2 workflow. */
const DOCS: Record<OrgType, string[]> = {
  Proprietorship: [
    "PAN of proprietor",
    ADDRESS_PROOF_ANY_ONE,
    BANK_PROOF,
    "Aadhaar of proprietor",
    GST_CERT,
  ],
  "Partnership Firm": [
    "PAN of Firm",
    ADDRESS_PROOF_ANY_ONE,
    BANK_PROOF,
    "Partners' KYC",
    GST_CERT,
    "Partnership Deed",
  ],
  LLP: [
    "PAN of LLP",
    ADDRESS_PROOF_ANY_ONE,
    BANK_PROOF,
    "LLP Deed",
    GST_CERT,
    "Certificate of Incorporation",
    "Directors' KYC",
  ],
  "Private Limited Company": [
    "PAN of Company",
    ADDRESS_PROOF_ANY_ONE,
    BANK_PROOF,
    "MOA and AOA",
    GST_CERT,
    "Certificate of Incorporation",
    "Directors' KYC",
  ],
  "Public Limited Company": [
    "PAN of Company",
    ADDRESS_PROOF_ANY_ONE,
    BANK_PROOF,
    "MOA and AOA",
    GST_CERT,
    "Certificate of Incorporation",
    "Directors' KYC",
  ],
  OPC: [
    "PAN of Company",
    ADDRESS_PROOF_ANY_ONE,
    BANK_PROOF,
    "MOA and AOA",
    GST_CERT,
    "Certificate of Incorporation",
    "Directors' KYC",
  ],
  "Trusts and Societies": [
    "PAN of Trust / Society",
    ADDRESS_PROOF_ANY_ONE,
    BANK_PROOF,
    "Trust Deed / Registration Certificate (for a Trust) or Memorandum / Bye-laws (for a Society)",
    GST_CERT,
  ],
  HUF: ["PAN of HUF", ADDRESS_PROOF_ANY_ONE, BANK_PROOF, GST_CERT],
};

/** Tab 2's "What do you intend to do?" question. */
const INTENT_OPTIONS = ["Import Goods", "Export Goods", "Import & Export Goods"] as const;
type Intent = (typeof INTENT_OPTIONS)[number];

/**
 * The document's price — ₹4,999 professional fee plus GST @ 18% (₹900) — kept
 * only as the fallback for an unpriced row. The catalog's fee lines win.
 */
const FEE_FALLBACK = { professional: 4999, govt: 0, gstPercent: 18 };

/**
 * Module entry point — the tabbed service page is the landing view and "Start
 * Application" swaps it for the stepper, the same shape as Section 332 / 354.
 */
export function IcegateModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <IcegateWizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug="icegate" onStartApplication={() => setApplying(true)} />;
}

export function IcegateWizard({
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

  // Tab 2
  const [authorisedName, setAuthorisedName] = useState("");
  const [designation, setDesignation] = useState("");
  const [intent, setIntent] = useState<Intent | "">("");

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

  const { service, loading: catalogLoading } = useCatalogService("icegate");

  const authority = service?.authority && service.authority !== "—" ? service.authority : "DGFT";
  const form = service?.form && service.form !== "—" ? service.form : "ANF-2A";

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
    add("orgType", "Type of Organisation", orgType);
    add("contactName", "Contact Person Name", contactName);
    add("contactEmail", "Contact Person Email", email);
    add("contactPhone", "Contact Person Mobile", mobile);
    add("authorisedName", "Authorised Person Name", authorisedName);
    add("designation", "Authorised Person Designation", designation);
    add("intent", "Intends To", intent);
    return rows;
  }, [enterpriseName, orgType, contactName, email, mobile, authorisedName, designation, intent]);

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
        fail("email", "Enter a valid email address — the DGFT portal's OTPs are sent here.");
      if (!IN_MOBILE_RE.test(mobile.trim()))
        fail(
          "mobile",
          "Enter a valid 10-digit mobile number — the DGFT portal's OTPs are sent here.",
        );
    }

    if (key === "authorised") {
      if (!authorisedName.trim()) fail("authorisedName", "Authorised person's name is required.");
      if (!designation.trim()) fail("designation", "Authorised person's designation is required.");
      if (!intent) fail("intent", "Tell us what the enterprise intends to do.");
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
        title: "ICE GATE Registration",
        authority,
        form,
        fees: fees.lines,
        total: fees.total,
        documents,
        details: answers.map((a) => ({ label: a.label, value: a.value })),
      },
      `ICEGATE_${(enterpriseName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <div>
      <WizardHero
        eyebrow="DGFT · Form ANF-2A"
        title="ICE GATE Registration"
        blurb="Guided Cloudcrest BM workspace for the Importer Exporter Code (IEC) filed through the DGFT portal — the unique code every importer or exporter needs, linked to your PAN."
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
                Foreign Trade (Development and Regulation) Act, 1992 · {authority}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                ICE GATE Registration Application
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
                  title="Enterprise & Contact Details"
                  desc="The enterprise applying for the IEC, and who we should reach about it."
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

              {/* STEP 2 — TAB 2 */}
              {stepKey === "authorised" && (
                <Section
                  title="Authorised Person & Intent"
                  desc="Who signs on the enterprise's behalf, and what the IEC will be used for."
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Authorised Person Name *" error={errors.authorisedName}>
                      <Input
                        value={authorisedName}
                        onChange={setAuthorisedName}
                        error={errors.authorisedName}
                      />
                    </Field>
                    <Field label="Designation *" error={errors.designation}>
                      <Input
                        value={designation}
                        onChange={setDesignation}
                        placeholder="e.g. Proprietor, Partner, Director"
                        error={errors.designation}
                      />
                    </Field>
                  </div>

                  <Field label="What do you intend to do? *" error={errors.intent}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {INTENT_OPTIONS.map((i) => (
                        <OptionCard
                          key={i}
                          active={intent === i}
                          onClick={() => {
                            setIntent(i);
                            setStepError(null);
                          }}
                          title={i}
                          subtitle=""
                        />
                      ))}
                    </div>
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
                  heading="ICE GATE Registration — Fee Breakdown"
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
            { label: "Service", value: "ICE GATE Registration" },
            { label: "Enterprise", value: enterpriseName },
            { label: "Type of Organisation", value: orgType },
            { label: "Intends To", value: intent },
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
        serviceSlug="icegate"
        serviceTitle="ICE GATE Registration"
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
        reason="Sign in to continue your ICE GATE registration — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/icegate"
      />
    </div>
  );
}
