import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  IdCard,
  Info,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { TypePickerPage, type RegistrationType } from "@/components/type-picker-page";
import { useAuth } from "@/hooks/use-auth";
import { useCatalogService } from "@/lib/service-catalog";
import { useFeeEstimate, type PanTanFeeContext } from "@/lib/fees-api";
import {
  EMAIL_RE,
  Field,
  FeesStep,
  IN_MOBILE_RE,
  Input,
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
 * PAN / TAN — source: the client's "PANTAN Changes.docx".
 *
 * The document splits the service in two on its first page, so the module opens
 * with a two-card picker (PAN, TAN) and each side runs its own stepper:
 *
 *   PAN   applicant category (Indian Citizen / Indian Non-Individual Entity /
 *         Individual Who Is Not an Indian Citizen / Foreign Non-Individual
 *         Entity, Forms 93–96) → physical vs e-PAN for an Indian citizen, or an
 *         entity type for either non-individual category → checklist
 *   TAN   DSC mode and category of deductor (Form 135) → company type and
 *         nationality when the deductor is a company or a company's branch →
 *         checklist
 *
 * Form numbers are the document's own (93–96, 135) at the client's instruction,
 * not the statutory 49A / 49AA / 49B.
 *
 * Documents: the document lists most requirements as alternatives ("Any ONE:
 * Aadhaar / Passport / Driving License / Voter ID"). Each group is ONE checklist
 * entry naming the alternatives, so the applicant uploads one file against it.
 * Mirrors `backend/src/config/panTanCatalog.ts` — keep the two in sync.
 *
 * Fees come from the `pan-tan-pan` / `pan-tan-tan` catalog rows, so the admin
 * owns each price in Admin → Services.
 */

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Income Tax Department · NSDL / UTIITSL" },
  { icon: IdCard, label: "Category-wise Forms" },
  { icon: Zap, label: "Instant e-PAN Option" },
];

/* -------------------------------------------------------------------------- *
 * PAN
 * -------------------------------------------------------------------------- */

const PAN_CATEGORIES = [
  {
    key: "indian-citizen",
    title: "Indian Citizen",
    form: "Form 93",
    blurb:
      "An individual who is a citizen of India, applying for a physical PAN card or an instant e-PAN.",
  },
  {
    key: "indian-entity",
    title: "Indian Non-Individual Entity",
    form: "Form 94",
    blurb:
      "A company, LLP, firm, trust, HUF, AOP / BOI, artificial juridical person or local authority formed in India.",
  },
  {
    key: "foreign-individual",
    title: "Individual Who Is Not an Indian Citizen",
    form: "Form 95",
    blurb: "A foreign national, PIO or OCI cardholder.",
  },
  {
    key: "foreign-entity",
    title: "Foreign Non-Individual Entity",
    form: "Form 96",
    blurb:
      "An entity incorporated or registered outside India, or approved to set up an office in India.",
  },
];

const PAN_DELIVERY_MODES = ["Physical PAN", "E-PAN (Instant)"];

const PAN_INDIAN_ENTITY_TYPES = [
  "Company",
  "Association of Persons / Body of Individuals",
  "Trust",
  "Limited Liability Partnership",
  "Firm",
  "Hindu Undivided Family",
  "Artificial Juridical Person",
  "Local Authority",
];

/**
 * The document splits AOP and BOI here where the Indian list combines them, and
 * lists no Hindu Undivided Family — both kept exactly as written.
 */
const PAN_FOREIGN_ENTITY_TYPES = [
  "Association of Persons",
  "Body of Individuals",
  "Company",
  "Trust",
  "Limited Liability Partnership",
  "Firm",
  "Artificial Juridical Person",
  "Local Authority",
];

const PAN_PHYSICAL_DOCUMENTS = [
  "Proof of Identity & Address — Aadhaar Card / Indian Passport / Driving License / Voter ID (any one)",
  "Proof of Date of Birth — Birth Certificate / Marriage Certificate / Indian Passport / Driving License / Voter ID (any one)",
  "Passport-size photograph",
  "Signature copy",
];

const PAN_EPAN_DOCUMENTS = ["Aadhaar Card", "Passport-size photograph", "Signature copy"];

const PAN_INDIAN_ENTITY_DOCUMENTS: Record<string, string> = {
  Company:
    "Certificate of Registration issued in India by the Registrar of Companies OR the Corporate Identity Number (CIN)",
  "Association of Persons / Body of Individuals":
    "Copy of the agreement OR Certificate of Registration from the relevant authority OR a Central / State Government document establishing identity and address",
  Trust: "Trust Deed OR Certificate of Registration issued by the Charity Commissioner",
  "Limited Liability Partnership":
    "Certificate of Registration issued by the Registrar of LLPs OR the LLP Identification Number",
  Firm: "Certificate of Registration issued by the Registrar of Firms OR the Partnership Deed",
  "Hindu Undivided Family":
    "Original authenticated Karta affidavit OR the applicable Karta proof of identity, address and date of birth",
  "Artificial Juridical Person": "Government Department document establishing identity and address",
  "Local Authority": "Government Department document establishing identity and address",
};

const PAN_FOREIGN_INDIVIDUAL_DOCUMENTS = [
  "Proof of Identity — Passport / PIO card issued by the Government of India / OCI card issued by the Government of India / other prescribed national or citizenship ID or Taxpayer Identification Number, duly attested (any one)",
  "Proof of Address — Passport / PIO card / OCI card / other prescribed national ID or Taxpayer Identification Number / bank account statement in the country of residence / NRE bank account statement in India / certificate of residence in India or Residential Permit / Foreigners Registration Office certificate showing an Indian address / visa with appointment letter or contract and the employer's Indian address certificate (any one)",
  "Proof of Date of Birth — Passport / PIO card / OCI card / other prescribed ID or Taxpayer Identification Number containing date of birth / birth certificate issued by the relevant authority / foreign birth certificate, duly attested (any one)",
];

const PAN_FOREIGN_ENTITY_DOCUMENTS = [
  "Certificate of Registration issued in the country where the applicant is located, duly attested OR the registration certificate issued in India / approval granted by Indian authorities to set up an office in India (any one)",
];

function panDocuments(category: string, deliveryMode: string, entityType: string): string[] {
  if (category === "indian-citizen") {
    return deliveryMode === "E-PAN (Instant)"
      ? [...PAN_EPAN_DOCUMENTS]
      : [...PAN_PHYSICAL_DOCUMENTS];
  }
  if (category === "indian-entity") {
    const doc = PAN_INDIAN_ENTITY_DOCUMENTS[entityType.trim()];
    return doc ? [doc] : [];
  }
  if (category === "foreign-individual") return [...PAN_FOREIGN_INDIVIDUAL_DOCUMENTS];
  if (category === "foreign-entity") return [...PAN_FOREIGN_ENTITY_DOCUMENTS];
  return [];
}

/* -------------------------------------------------------------------------- *
 * TAN
 * -------------------------------------------------------------------------- */

/**
 * The document calls this a checkbox, but the two are mutually exclusive, so
 * they render as a pair of option cards.
 */
const TAN_DSC_MODES = ["Non-DSC User", "DSC User"];

const TAN_DEDUCTOR_CATEGORIES = [
  "Company",
  "Branch / Division of a Company",
  "Individual",
  "Branch of Individual Business (Sole Proprietorship)",
  "LLP / Firm / Association of Persons / Trust / Body of Individuals / Artificial Juridical Person / Hindu Undivided Family",
  "Branch of LLP / Firm / Association of Persons / Trust / Body of Individuals / Artificial Juridical Person / Hindu Undivided Family",
];

const TAN_COMPANY_TYPES = [
  "Central Government Company / Company established by Central Act",
  "State Government Company / Company established by State Act",
  "Public Limited Company",
  "Private Limited Company",
  "One Person Company",
  "Section 8 Company",
  "Other Company",
];

const TAN_NATIONALITIES = ["Indian", "Foreign"];

const tanIsCompany = (c: string) => c === "Company" || c === "Branch / Division of a Company";
const tanIsIndividual = (c: string) =>
  c === "Individual" || c === "Branch of Individual Business (Sole Proprietorship)";

const TAN_INDIVIDUAL_DOCUMENTS = [
  "Proof of Identity — Aadhaar Card / Indian Passport / Driving License / Voter ID (any one)",
  "Proof of Address — Aadhaar Card / Indian Passport / Voter ID / Electricity Bill not more than 3 months old / Property Registration Document (any one)",
  "Proof of Date of Birth — Birth Certificate / Indian Passport / Voter ID / Marriage Certificate / Matriculation Certificate (any one)",
];

const TAN_RESPONSIBLE_PERSON_DOCUMENT =
  "PAN card of the person responsible for deduction / collection";

function tanDocuments(category: string): string[] {
  const c = category.trim();
  if (!c) return [];
  if (tanIsIndividual(c)) return [...TAN_INDIVIDUAL_DOCUMENTS];
  if (tanIsCompany(c))
    return [
      "Copy of the Certificate of Registration issued in India by the Registrar of Companies",
      TAN_RESPONSIBLE_PERSON_DOCUMENT,
    ];
  return ["Registration Certificate", TAN_RESPONSIBLE_PERSON_DOCUMENT];
}

/* -------------------------------------------------------------------------- *
 * Page 1 — pick the service.
 * -------------------------------------------------------------------------- */

const SERVICE_TYPES: RegistrationType[] = [
  {
    key: "pan",
    title: "PAN",
    short: "PAN",
    form: "Form 93 / 94 / 95 / 96",
    tags: ["Permanent Account Number"],
    popular: true,
    blurb: "The ten-character taxpayer identifier issued by the Income Tax Department.",
    covers: [
      "Indian Citizen — Form 93",
      "Indian Non-Individual Entity — Form 94",
      "Individual Who Is Not an Indian Citizen — Form 95",
      "Foreign Non-Individual Entity — Form 96",
    ],
    about: "",
    who: [],
    docs: [],
  },
  {
    key: "tan",
    title: "TAN",
    short: "TAN",
    form: "Form 135",
    tags: ["TDS / TCS", "Deductor"],
    blurb: "The account number every person who deducts or collects tax at source must hold.",
    covers: ["Non-Government category deductors — Form 135"],
    about: "",
    who: [],
    docs: [],
  },
];

/** PAN / TAN entry point — pick the service, then that service's stepper. */
export function PanTanModule({ initialName, slug }: { initialName?: string; slug?: string }) {
  const fromSlug = slug === "pan-tan-pan" ? "pan" : slug === "pan-tan-tan" ? "tan" : undefined;
  const [selectedKey, setSelectedKey] = useState<string | undefined>(fromSlug);
  const [applying, setApplying] = useState(false);

  if (applying && selectedKey === "pan") {
    return <PanStepper initialName={initialName} onExit={() => setApplying(false)} />;
  }
  if (applying && selectedKey === "tan") {
    return <TanStepper initialName={initialName} onExit={() => setApplying(false)} />;
  }

  return (
    <TypePickerPage
      catalogSlug="pan-tan"
      titlePrefix=""
      formDataKey="panTanService"
      backLabel="Change service"
      initialKey={selectedKey}
      onSelectKey={(k) => setSelectedKey(k ?? undefined)}
      onStartApplication={(k) => {
        setSelectedKey(k);
        setApplying(true);
      }}
      hero={{
        badge: "Income Tax Department · NSDL / UTIITSL",
        title: "PAN / TAN Services",
        subtitle:
          "Choose the service you need. Each opens a full guide — who can apply, the documents required and the fee — before you apply.",
        highlights: HIGHLIGHTS,
      }}
      picker={{
        eyebrow: "PAN / TAN",
        heading: "Select a service",
        subtitle:
          "Pick PAN or TAN to see who can apply, the documents required and to start your application.",
      }}
      types={SERVICE_TYPES}
    />
  );
}

/* -------------------------------------------------------------------------- *
 * Shared contact state + summary plumbing.
 * -------------------------------------------------------------------------- */

function useContactPrefill() {
  const { user } = useAuth();
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  useEffect(() => {
    if (!user) return;
    setEmail((prev) => prev || user.email || "");
    setMobile((prev) => prev || format10DigitPhone(user.phone));
    fetchProfileContact().then((c) => {
      if (!c) return;
      setEmail((prev) => prev || c.email);
      setMobile((prev) => prev || c.phone);
    });
  }, [user]);

  return { user, contactName, setContactName, email, setEmail, mobile, setMobile };
}

/** The documents step, shared by both steppers. */
function DocumentsStep({ items, note }: { items: string[]; note: string }) {
  return (
    <Section title="Document Checklist" desc={note}>
      {items.length === 0 ? (
        <div className="text-[13px] text-muted-foreground">
          Complete the previous step to see the documents for your selection.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-panel p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="size-3.5 text-primary shrink-0" />
            <div className="text-xs font-semibold text-foreground">Documents to keep ready</div>
            <span className="text-[10px] mono text-muted-foreground ml-auto">{items.length}</span>
          </div>
          <ul className="space-y-2">
            {items.map((d) => (
              <li key={d} className="flex items-start gap-2 text-[12px] leading-relaxed">
                <CheckCircle2 className="size-3.5 text-primary/60 shrink-0 mt-0.5" />
                <span className="text-foreground/85">{d}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
        <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
        <div className="text-[11px] text-foreground/70 leading-relaxed">
          Where a line lists several documents, any <span className="font-semibold">one</span> of
          them is enough — you'll get a single upload slot for it when you submit.
        </div>
      </div>
    </Section>
  );
}

/** The contact block both steppers ask for. */
function ContactFields({
  contactName,
  setContactName,
  email,
  setEmail,
  mobile,
  setMobile,
  errors,
  nameLabel,
}: {
  contactName: string;
  setContactName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  mobile: string;
  setMobile: (v: string) => void;
  errors: Record<string, string>;
  nameLabel: string;
}) {
  return (
    <div className="pt-2 border-t border-border space-y-4">
      <Field label={nameLabel} error={errors.contactName}>
        <Input value={contactName} onChange={setContactName} error={errors.contactName} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Email ID *"
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
          label="Mobile Number *"
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
  );
}

/* -------------------------------------------------------------------------- *
 * PAN stepper.
 * -------------------------------------------------------------------------- */

const PAN_STEPS = [
  { key: "category", label: "Applicant Category" },
  { key: "type", label: "Applicant Details" },
  { key: "documents", label: "Documents" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

function PanStepper({ initialName = "", onExit }: { initialName?: string; onExit: () => void }) {
  const { user, contactName, setContactName, email, setEmail, mobile, setMobile } =
    useContactPrefill();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [entityType, setEntityType] = useState("");
  const [applicantName, setApplicantName] = useState(initialName);

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  const { service, loading: catalogLoading } = useCatalogService(["pan-tan-pan", "pan-tan"]);
  const feeContext: PanTanFeeContext = {
    kind: "pan-tan",
    slug: "pan-tan-pan",
    service: "pan",
    category,
  };
  const fees = useFeeEstimate(feeContext, !!user);
  const professionalFee = (() => {
    const line = fees.lines.find((l) => /professional/i.test(l.label))?.amount;
    return line && line > 0 ? line : null;
  })();

  const selected = PAN_CATEGORIES.find((c) => c.key === category);
  const isIndianCitizen = category === "indian-citizen";
  const needsEntityType = category === "indian-entity" || category === "foreign-entity";
  const entityOptions =
    category === "indian-entity" ? PAN_INDIAN_ENTITY_TYPES : PAN_FOREIGN_ENTITY_TYPES;
  const documents = panDocuments(category, deliveryMode, entityType);
  const form = selected?.form ?? "Form 93 / 94 / 95 / 96";
  const authority =
    service?.authority && service.authority !== "—" ? service.authority : "Income Tax / NSDL";
  const stepKey = PAN_STEPS[step]?.key;

  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string; wide?: boolean }[] = [];
    const add = (key: string, label: string, value: string, wide?: boolean) => {
      if (value.trim()) rows.push({ key, label, value: value.trim(), wide });
    };
    add("panTanService", "Service", "PAN");
    add("applicantCategory", "Applicant Category", selected?.title ?? "", true);
    add("formNo", "Form", form);
    add("panDeliveryMode", "PAN Type", deliveryMode);
    add("entityType", "Entity Type", entityType, true);
    add("applicantName", "Applicant / Entity Name", applicantName, true);
    add("contactName", "Contact Person Name", contactName);
    add("contactEmail", "Email ID", email);
    add("contactPhone", "Mobile Number", mobile);
    return rows;
  }, [selected, form, deliveryMode, entityType, applicantName, contactName, email, mobile]);

  const validateStep = (key: string | undefined): boolean => {
    const e: Record<string, string> = {};
    let first: string | null = null;
    const fail = (f: string, m: string) => {
      e[f] = m;
      if (!first) first = m;
    };
    if (key === "category" && !category) fail("category", "Please select the applicant category.");
    if (key === "type") {
      if (isIndianCitizen && !deliveryMode)
        fail("deliveryMode", "Choose a physical PAN card or the instant e-PAN.");
      if (needsEntityType && !entityType) fail("entityType", "Please select the entity type.");
      if (!applicantName.trim()) fail("applicantName", "Applicant / entity name is required.");
      if (!contactName.trim()) fail("contactName", "Contact person name is required.");
      if (!EMAIL_RE.test(email.trim())) fail("email", "Enter a valid email address.");
      if (!IN_MOBILE_RE.test(mobile.trim()))
        fail("mobile", "Enter a valid 10-digit mobile number.");
    }
    setErrors(e);
    setStepError(first);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!user) return setOpenSignIn(true);
    if (validateStep(stepKey)) {
      setStep((s) => Math.min(PAN_STEPS.length - 1, s + 1));
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
        title: `PAN — ${selected?.title ?? "Application"}`,
        authority,
        form,
        fees: fees.lines,
        total: fees.total,
        documents,
        details: answers.map((a) => ({ label: a.label, value: a.value })),
      },
      `PAN_Summary_${(applicantName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <StepperShell
      heroTitle="PAN Application"
      eyebrow={`PAN · ${authority}`}
      heading={selected ? `PAN — ${selected.title}` : "PAN Application"}
      steps={PAN_STEPS}
      step={step}
      setStep={setStep}
      user={user}
      onSignIn={() => setOpenSignIn(true)}
      onExit={onExit}
      stepError={stepError}
      onBack={back}
      onNext={next}
      onDownload={onDownload}
      onSubmit={() => setOpenReg(true)}
      sidebar={[
        { label: "Service", value: "PAN" },
        { label: "Category", value: selected?.title ?? "" },
        { label: "Form", value: selected ? form : "" },
        { label: "Documents", value: documents.length ? String(documents.length) : "" },
      ]}
      professionalFee={professionalFee}
      gstPercent={service?.gstPercent || 18}
      formNo={form}
    >
      {stepKey === "category" && (
        <Section
          title="Select Applicant Category"
          desc="Each category has its own form and its own document set."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PAN_CATEGORIES.map((c) => (
              <OptionCard
                key={c.key}
                active={category === c.key}
                onClick={() => {
                  setCategory(c.key);
                  setDeliveryMode("");
                  setEntityType("");
                }}
                title={`${c.title} — ${c.form}`}
                subtitle={c.blurb}
              />
            ))}
          </div>
          {errors.category && (
            <p className="text-[11px] text-destructive font-medium">{errors.category}</p>
          )}
        </Section>
      )}

      {stepKey === "type" && (
        <Section
          title="Applicant Details"
          desc={selected ? `${selected.title} · ${selected.form}` : ""}
        >
          {isIndianCitizen && (
            <div>
              <div className="text-xs font-medium text-foreground/90 mb-2">PAN Type *</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PAN_DELIVERY_MODES.map((m) => (
                  <OptionCard
                    key={m}
                    active={deliveryMode === m}
                    onClick={() => setDeliveryMode(m)}
                    title={m}
                    subtitle={
                      m === "E-PAN (Instant)"
                        ? "Issued instantly against Aadhaar — no physical card."
                        : "A physical PAN card despatched to your address."
                    }
                  />
                ))}
              </div>
              {errors.deliveryMode && (
                <p className="text-[11px] text-destructive font-medium mt-1">
                  {errors.deliveryMode}
                </p>
              )}
            </div>
          )}

          {needsEntityType && (
            <Field label="Entity Type *" error={errors.entityType}>
              <Select value={entityType} onChange={setEntityType} error={errors.entityType}>
                <option value="">-- Select --</option>
                {entityOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Applicant / Entity Name *" error={errors.applicantName}>
            <Input
              value={applicantName}
              onChange={setApplicantName}
              placeholder="Name exactly as it should appear on the PAN"
              error={errors.applicantName}
            />
          </Field>

          <ContactFields
            contactName={contactName}
            setContactName={setContactName}
            email={email}
            setEmail={setEmail}
            mobile={mobile}
            setMobile={setMobile}
            errors={errors}
            nameLabel="Contact Person Name *"
          />
        </Section>
      )}

      {stepKey === "documents" && (
        <DocumentsStep
          items={documents}
          note={
            selected
              ? `What a ${selected.title.toLowerCase()} needs for ${selected.form}.`
              : "Documents for your selection."
          }
        />
      )}

      {stepKey === "fees" && (
        <FeesStep
          signedIn={!!user}
          onSignIn={() => setOpenSignIn(true)}
          loading={catalogLoading || fees.loading}
          lines={fees.lines}
          total={fees.total}
          heading="Estimated PAN Fee Breakdown"
          unpricedNote="Pricing for this service isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
        />
      )}

      {stepKey === "summary" && <SummaryStep answers={answers} documents={documents} />}

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="pan-tan-pan"
        serviceTitle={`PAN — ${selected?.title ?? "Application"}`}
        authority={authority}
        form={form}
        documents={documents}
        initialName={contactName}
        initialEmail={email}
        initialPhone={mobile}
        formData={formData}
        fees={fees.lines}
        feeTotal={fees.total}
        feeContext={feeContext}
      />
      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your PAN application — we'll save your progress, show the fee breakdown and let you submit."
        next="/m/pan-tan"
      />
    </StepperShell>
  );
}

/* -------------------------------------------------------------------------- *
 * TAN stepper.
 * -------------------------------------------------------------------------- */

const TAN_STEPS = [
  { key: "category", label: "Deductor Category" },
  { key: "type", label: "Deductor Details" },
  { key: "documents", label: "Documents" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

function TanStepper({ initialName = "", onExit }: { initialName?: string; onExit: () => void }) {
  const { user, contactName, setContactName, email, setEmail, mobile, setMobile } =
    useContactPrefill();
  const [step, setStep] = useState(0);
  const [dscMode, setDscMode] = useState("");
  const [deductorCategory, setDeductorCategory] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [nationality, setNationality] = useState("");
  const [deductorName, setDeductorName] = useState(initialName);
  // Details of the person responsible for deduction / collection. The document
  // lists these under its checklist, but a designation and a phone number are
  // data rather than files, so they are collected here; only that person's PAN
  // card stays a document.
  const [responsibleName, setResponsibleName] = useState("");
  const [responsiblePan, setResponsiblePan] = useState("");
  const [responsibleDesignation, setResponsibleDesignation] = useState("");

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  const { service, loading: catalogLoading } = useCatalogService(["pan-tan-tan", "pan-tan"]);
  const feeContext: PanTanFeeContext = {
    kind: "pan-tan",
    slug: "pan-tan-tan",
    service: "tan",
    category: deductorCategory,
  };
  const fees = useFeeEstimate(feeContext, !!user);
  const professionalFee = (() => {
    const line = fees.lines.find((l) => /professional/i.test(l.label))?.amount;
    return line && line > 0 ? line : null;
  })();

  const isCompany = tanIsCompany(deductorCategory);
  const isIndividual = tanIsIndividual(deductorCategory);
  const documents = tanDocuments(deductorCategory);
  const form = "Form 135";
  const authority =
    service?.authority && service.authority !== "—" ? service.authority : "Income Tax / NSDL";
  const stepKey = TAN_STEPS[step]?.key;

  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string; wide?: boolean }[] = [];
    const add = (key: string, label: string, value: string, wide?: boolean) => {
      if (value.trim()) rows.push({ key, label, value: value.trim(), wide });
    };
    add("panTanService", "Service", "TAN");
    add("formNo", "Form", form);
    add("dscMode", "DSC Mode", dscMode);
    add("deductorCategory", "Category of Deductor", deductorCategory, true);
    add("companyType", "Type of Company", companyType, true);
    add("nationality", "Nationality of Deductor", nationality);
    add("deductorName", "Deductor Name", deductorName, true);
    add("responsibleName", "Person Responsible — Name", responsibleName);
    add("responsibleDesignation", "Person Responsible — Designation", responsibleDesignation);
    add("responsiblePan", "Person Responsible — PAN", responsiblePan);
    add("contactName", "Contact Person Name", contactName);
    add("contactEmail", "Email ID", email);
    add("contactPhone", "Mobile Number", mobile);
    return rows;
  }, [
    dscMode,
    deductorCategory,
    companyType,
    nationality,
    deductorName,
    responsibleName,
    responsibleDesignation,
    responsiblePan,
    contactName,
    email,
    mobile,
  ]);

  const validateStep = (key: string | undefined): boolean => {
    const e: Record<string, string> = {};
    let first: string | null = null;
    const fail = (f: string, m: string) => {
      e[f] = m;
      if (!first) first = m;
    };
    if (key === "category") {
      if (!dscMode) fail("dscMode", "Please select whether you have a DSC.");
      if (!deductorCategory) fail("deductorCategory", "Please select the category of deductor.");
    }
    if (key === "type") {
      if (isCompany && !companyType) fail("companyType", "Please select the type of company.");
      if (isCompany && !nationality)
        fail("nationality", "Please select the nationality of the deductor.");
      if (!deductorName.trim()) fail("deductorName", "Deductor name is required.");
      if (!isIndividual) {
        if (!responsibleName.trim())
          fail("responsibleName", "Name of the person responsible is required.");
        if (!responsibleDesignation.trim())
          fail("responsibleDesignation", "Designation of the person responsible is required.");
      }
      if (!contactName.trim()) fail("contactName", "Contact person name is required.");
      if (!EMAIL_RE.test(email.trim())) fail("email", "Enter a valid email address.");
      if (!IN_MOBILE_RE.test(mobile.trim()))
        fail("mobile", "Enter a valid 10-digit mobile number.");
    }
    setErrors(e);
    setStepError(first);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!user) return setOpenSignIn(true);
    if (validateStep(stepKey)) {
      setStep((s) => Math.min(TAN_STEPS.length - 1, s + 1));
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
        title: "TAN Application",
        authority,
        form,
        fees: fees.lines,
        total: fees.total,
        documents,
        details: answers.map((a) => ({ label: a.label, value: a.value })),
      },
      `TAN_Summary_${(deductorName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <StepperShell
      heroTitle="TAN Application"
      eyebrow={`TAN · ${authority}`}
      heading="TAN Application"
      steps={TAN_STEPS}
      step={step}
      setStep={setStep}
      user={user}
      onSignIn={() => setOpenSignIn(true)}
      onExit={onExit}
      stepError={stepError}
      onBack={back}
      onNext={next}
      onDownload={onDownload}
      onSubmit={() => setOpenReg(true)}
      sidebar={[
        { label: "Service", value: "TAN" },
        { label: "Deductor", value: deductorCategory },
        { label: "DSC Mode", value: dscMode },
        { label: "Documents", value: documents.length ? String(documents.length) : "" },
      ]}
      professionalFee={professionalFee}
      gstPercent={service?.gstPercent || 18}
      formNo={form}
    >
      {stepKey === "category" && (
        <Section title="DSC Mode & Category of Deductor" desc="Form 135 — non-government category.">
          <div>
            <div className="text-xs font-medium text-foreground/90 mb-2">DSC Mode *</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TAN_DSC_MODES.map((m) => (
                <OptionCard
                  key={m}
                  active={dscMode === m}
                  onClick={() => setDscMode(m)}
                  title={m}
                  subtitle={
                    m === "DSC User"
                      ? "You hold a Digital Signature Certificate and will sign digitally."
                      : "No Digital Signature Certificate — the acknowledgement is signed and sent physically."
                  }
                />
              ))}
            </div>
            {errors.dscMode && (
              <p className="text-[11px] text-destructive font-medium mt-1">{errors.dscMode}</p>
            )}
          </div>

          <Field label="Category of Deductor *" error={errors.deductorCategory}>
            <Select
              value={deductorCategory}
              onChange={(v) => {
                setDeductorCategory(v);
                setCompanyType("");
                setNationality("");
              }}
              error={errors.deductorCategory}
            >
              <option value="">-- Select --</option>
              {TAN_DEDUCTOR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <div className="rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
            <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
            <div className="text-[11px] text-foreground/70 leading-relaxed">
              The category of deductor decides your document checklist.
            </div>
          </div>
        </Section>
      )}

      {stepKey === "type" && (
        <Section title="Deductor Details" desc={deductorCategory}>
          {isCompany && (
            <>
              <Field label="Type of Company *" error={errors.companyType}>
                <Select value={companyType} onChange={setCompanyType} error={errors.companyType}>
                  <option value="">-- Select --</option>
                  {TAN_COMPANY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <div className="text-xs font-medium text-foreground/90 mb-2">
                  Nationality of Deductor *
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TAN_NATIONALITIES.map((n) => (
                    <OptionCard
                      key={n}
                      active={nationality === n}
                      onClick={() => setNationality(n)}
                      title={n}
                      subtitle={
                        n === "Indian"
                          ? "Incorporated or established in India."
                          : "Incorporated or established outside India."
                      }
                    />
                  ))}
                </div>
                {errors.nationality && (
                  <p className="text-[11px] text-destructive font-medium mt-1">
                    {errors.nationality}
                  </p>
                )}
              </div>
            </>
          )}

          <Field label="Deductor Name *" error={errors.deductorName}>
            <Input
              value={deductorName}
              onChange={setDeductorName}
              placeholder="Name of the deductor as registered"
              error={errors.deductorName}
            />
          </Field>

          {!isIndividual && (
            <div className="pt-2 border-t border-border space-y-4">
              <div className="text-xs font-semibold text-foreground/90">
                Person Responsible for Deduction / Collection
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Name *" error={errors.responsibleName}>
                  <Input
                    value={responsibleName}
                    onChange={setResponsibleName}
                    error={errors.responsibleName}
                  />
                </Field>
                <Field label="Designation *" error={errors.responsibleDesignation}>
                  <Input
                    value={responsibleDesignation}
                    onChange={setResponsibleDesignation}
                    placeholder="e.g. Finance Manager"
                    error={errors.responsibleDesignation}
                  />
                </Field>
              </div>
              <Field label="PAN" hint="Their PAN card is also on the document checklist.">
                <Input
                  value={responsiblePan}
                  onChange={(v) => setResponsiblePan(v.toUpperCase().slice(0, 10))}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                />
              </Field>
            </div>
          )}

          <ContactFields
            contactName={contactName}
            setContactName={setContactName}
            email={email}
            setEmail={setEmail}
            mobile={mobile}
            setMobile={setMobile}
            errors={errors}
            nameLabel="Contact Person Name *"
          />
        </Section>
      )}

      {stepKey === "documents" && (
        <DocumentsStep
          items={documents}
          note={
            deductorCategory
              ? `What a ${deductorCategory} needs for Form 135.`
              : "Documents for your selection."
          }
        />
      )}

      {stepKey === "fees" && (
        <FeesStep
          signedIn={!!user}
          onSignIn={() => setOpenSignIn(true)}
          loading={catalogLoading || fees.loading}
          lines={fees.lines}
          total={fees.total}
          heading="Estimated TAN Fee Breakdown"
          unpricedNote="Pricing for this service isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
        />
      )}

      {stepKey === "summary" && <SummaryStep answers={answers} documents={documents} />}

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="pan-tan-tan"
        serviceTitle="TAN Application"
        authority={authority}
        form={form}
        documents={documents}
        initialName={contactName}
        initialEmail={email}
        initialPhone={mobile}
        formData={formData}
        fees={fees.lines}
        feeTotal={fees.total}
        feeContext={feeContext}
      />
      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your TAN application — we'll save your progress, show the fee breakdown and let you submit."
        next="/m/pan-tan"
      />
    </StepperShell>
  );
}

/* -------------------------------------------------------------------------- *
 * Shared chrome.
 * -------------------------------------------------------------------------- */

function SummaryStep({
  answers,
  documents,
}: {
  answers: { key: string; label: string; value: string; wide?: boolean }[];
  documents: string[];
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="text-xs font-bold uppercase tracking-wider text-primary">
            Consolidated Summary
          </div>
          <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning font-semibold">
            READY TO SUBMIT
          </span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {answers.map((a) => (
            <div key={a.key} className={a.wide ? "sm:col-span-2" : ""}>
              <dt className="text-muted-foreground">{a.label}</dt>
              <dd className="font-semibold text-foreground mt-0.5 break-words whitespace-pre-wrap">
                {a.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {documents.length > 0 && (
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
      )}
    </div>
  );
}

/** The hero / stepper / actions / sidebar frame both steppers render inside. */
function StepperShell({
  heroTitle,
  eyebrow,
  heading,
  steps,
  step,
  setStep,
  user,
  onSignIn,
  onExit,
  stepError,
  onBack,
  onNext,
  onDownload,
  onSubmit,
  sidebar,
  professionalFee,
  gstPercent,
  formNo,
  children,
}: {
  heroTitle: string;
  eyebrow: string;
  heading: string;
  steps: { key: string; label: string }[];
  step: number;
  setStep: (s: number) => void;
  user: unknown;
  onSignIn: () => void;
  onExit: () => void;
  stepError: string | null;
  onBack: () => void;
  onNext: () => void;
  onDownload: () => void;
  onSubmit: () => void;
  sidebar: { label: string; value: string }[];
  professionalFee: number | null;
  gstPercent: number;
  formNo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <WizardHero title={heroTitle} highlights={HIGHLIGHTS} />
      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-6 md:px-10 py-8 animate-in-up">
            <button
              type="button"
              onClick={onExit}
              className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <ArrowLeft className="size-3.5" /> Back to service details
            </button>

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">{eyebrow}</div>
              <h2 className="text-2xl font-semibold tracking-tight">{heading}</h2>
            </div>

            <div className="rounded-xl border border-border bg-surface shadow-card p-4">
              <Stepper
                steps={steps}
                current={step}
                onGo={(s) => (s > step && !user ? onSignIn() : setStep(s))}
              />
            </div>

            {stepError && (
              <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 flex items-center gap-2.5 text-xs text-destructive animate-in fade-in-50">
                <AlertTriangle className="size-4 shrink-0" />
                <span className="font-semibold">{stepError}</span>
              </div>
            )}

            <div key={step} className="mt-6 space-y-6">
              {children}
              <WizardActions
                step={step}
                stepCount={steps.length}
                nextLabel={steps[step + 1]?.label}
                onBack={onBack}
                onNext={onNext}
                onDownload={onDownload}
                onSubmit={onSubmit}
              />
            </div>
          </div>
        </div>

        <WizardSidebar
          selection={sidebar}
          professionalFee={professionalFee}
          gstPercent={gstPercent}
          formNo={formNo}
        />
      </div>
    </div>
  );
}
