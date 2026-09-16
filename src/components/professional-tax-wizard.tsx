import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Coins, Info, MapPin, ShieldCheck } from "lucide-react";
import { EntityStateWizard, REGISTRATION_STATES } from "@/components/entity-state-wizard";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useCatalogService, type CatalogService } from "@/lib/service-catalog";
import { useFeeEstimate, type ProfessionalTaxFeeContext } from "@/lib/fees-api";
import { blockNegativeKeys, nonNegative } from "@/lib/number-input";
import {
  EMAIL_RE,
  Field,
  FeesStep,
  IN_MOBILE_RE,
  Input,
  Section,
  Select,
  TextArea,
  WizardActions,
  WizardHero,
  WizardSidebar,
  downloadSummaryPdf,
  fetchProfileContact,
  fieldClass,
  format10DigitPhone,
} from "@/components/wizard-ui";

/**
 * Professional Tax registration — source: the client's "Professional Tax"
 * document.
 *
 * Professional Tax is levied by the state, so the service is registered
 * state-wise the way the Labour Licence is: the applicant picks Telangana,
 * Andhra Pradesh or Karnataka, which opens that state's catalog row
 * (`professional-tax-<state>`, authored in Admin → Services) as the service
 * page; Start Application opens the stepper:
 *
 *   1. Enterprise & Legal Profile — name, type of organisation, state, and the
 *      contact person's email and mobile (the department's OTPs go there);
 *   2. Business Details — what the business does, plus the persons employed
 *      (male / female / others), as on the MSME form;
 *   3. Fees — the state row's fee lines as the admin authored them. Unlike the
 *      Labour Licence there is no computed government fee: the document prices
 *      the service at Professional Fee + GST only;
 *   4. Summary.
 *
 * The service page shows the client document's general "Documents required"
 * list, which the admin owns; the checklist shown when submitting is
 * APPLICATION_DOCUMENTS below, narrowed to the chosen type of organisation.
 */

const STEPS = [
  { key: "profile", label: "Enterprise & Legal Profile" },
  { key: "business", label: "Business Details" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

/** The six types the document lists, in its order. */
const ORG_TYPES = ["Proprietor", "Company", "LLP", "Partnership Firm", "Society", "Trust"];

const HIGHLIGHTS = [
  { icon: Coins, label: "Professional Tax Registration" },
  { icon: MapPin, label: "Telangana · Andhra Pradesh · Karnataka" },
  { icon: ShieldCheck, label: "State Commercial Tax Department" },
];

const stateSlugOf = (name: string) => REGISTRATION_STATES.find((s) => s.name === name)?.slug;

/**
 * The per-organisation checklist the applicant is asked to bring when
 * submitting. This is deliberately NOT the service page's document list: the
 * page shows the client document's general "Documents required" list, which the
 * admin owns in Admin → Services, while the checklist below depends on the
 * type of organisation and so lives in code.
 *
 * Mirrors `PROFESSIONAL_TAX_APPLICATION_DOCUMENTS` in
 * `backend/src/config/professionalTaxCatalog.ts`.
 */
const APPLICATION_DOCUMENTS = [
  "PAN of the Organisation",
  "Key Person KYC",
  "Partner Details — mail, mobile no, Aadhaar and PAN (Partnership Firm and LLP only)",
  "Director Details — mail, mobile no, Aadhaar and PAN (Companies only)",
  "Latest Bank statement of the Organisation",
  "Rental Agreement of the Place of Business",
  "Certificate of Incorporation (Companies and LLP only)",
  "Partnership Deed (Partnership Firm only)",
  "Registration Certificate (Trusts and Societies only)",
  "MOA and AOA (Companies only)",
];

/**
 * Which organisation types each checklist item applies to. Matched on the
 * item's text rather than an id, so a reworded item still resolves; an item
 * that matches nothing here applies to every type, which is the safe default.
 *
 * Keep in sync with `PROFESSIONAL_TAX_DOCUMENT_RULES` in
 * `backend/src/config/professionalTaxCatalog.ts`.
 */
const DOCUMENT_RULES: { test: RegExp; types: string[] }[] = [
  { test: /partner details/i, types: ["Partnership Firm", "LLP"] },
  { test: /director details/i, types: ["Company"] },
  { test: /certificate of incorporation/i, types: ["Company", "LLP"] },
  { test: /partnership deed/i, types: ["Partnership Firm"] },
  { test: /registration certificate/i, types: ["Society", "Trust"] },
  { test: /\bmoa\b|memorandum/i, types: ["Company"] },
];

/** True when the checklist item is asked of this organisation type. */
function documentAppliesTo(name: string, orgType: string): boolean {
  const rule = DOCUMENT_RULES.find((r) => r.test.test(name));
  if (!rule) return true;
  // Before a type is picked, show the whole checklist rather than hiding items.
  if (!orgType) return true;
  return rule.types.includes(orgType);
}

export function ProfessionalTaxWizard({ initialName }: { initialName?: string }) {
  return (
    <EntityStateWizard
      config={{
        baseSlug: "professional-tax",
        baseTitle: "Professional Tax",
        initialName,
        changeLabel: "Change state",
        hero: {
          eyebrow: "State Commercial Tax Department",
          title: "Professional Tax Registration",
          subtitle:
            "Register for Professional Tax with your State Commercial Tax Department. Choose your state to see who can apply, the documents and the fee before you apply.",
          highlights: HIGHLIGHTS,
        },
        stateStep: {
          heading: "Select your state",
          subtitle:
            "Professional Tax is levied state-wise — Telangana, Andhra Pradesh or Karnataka.",
        },
        renderWizard: ({ state, service, onBack, initialName }) => (
          <ProfessionalTaxStepper
            state={state}
            service={service}
            onExit={onBack}
            initialName={initialName}
          />
        ),
      }}
    />
  );
}

function ProfessionalTaxStepper({
  state: pickedState,
  service: pickedService,
  onExit,
  initialName = "",
}: {
  state: string;
  service: CatalogService;
  onExit: () => void;
  initialName?: string;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Tab 1 — Enterprise & Legal Profile.
  const [organisationName, setOrganisationName] = useState(initialName);
  const [orgType, setOrgType] = useState("");
  const [state, setState] = useState(pickedState);
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  // Tab 2 — Business Details.
  const [businessDetails, setBusinessDetails] = useState("");
  const [male, setMale] = useState(0);
  const [female, setFemale] = useState(0);
  const [others, setOthers] = useState(0);
  const employees = male + female + others;

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
      setEmail((prev) => prev || c.email);
      setMobile((prev) => prev || c.phone);
    });
  }, [user]);

  // The state can be changed on the first tab; its own row then supplies the
  // checklist and fee lines.
  const stateRowSlug = `professional-tax-${stateSlugOf(state) ?? stateSlugOf(pickedState)}`;
  const { service: stateService, loading: catalogLoading } = useCatalogService([
    stateRowSlug,
    "professional-tax",
  ]);
  const service = stateService ?? pickedService;

  const feeContext: ProfessionalTaxFeeContext = {
    kind: "professional-tax",
    slug: stateRowSlug,
    state,
  };
  const fees = useFeeEstimate(feeContext, !!user);
  const professionalFee = (() => {
    const line = fees.lines.find((l) => /professional/i.test(l.label))?.amount;
    return line && line > 0 ? line : null;
  })();

  // The submit-time checklist, narrowed to the chosen type of organisation.
  const documents = APPLICATION_DOCUMENTS.filter((d) => documentAppliesTo(d, orgType));

  const title = `Professional Tax — ${state}`;
  const authority =
    service?.authority && service.authority !== "—"
      ? service.authority
      : "State Commercial Tax Dept.";
  const stepKey = STEPS[step]?.key;

  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string }[] = [];
    const add = (key: string, label: string, value: string) => {
      if (value.trim()) rows.push({ key, label, value: value.trim() });
    };
    add("organisationName", "Name of Enterprise / Organisation", organisationName);
    add("organisationType", "Type of Organisation", orgType);
    add("state", "State", state);
    add("contactName", "Contact Person Name", contactName);
    add("contactEmail", "Contact Person Email", email);
    add("contactPhone", "Contact Person Mobile", mobile);
    add("businessDetails", "Business Details", businessDetails);
    add("employeesMale", "Persons Employed — Male", String(male));
    add("employeesFemale", "Persons Employed — Female", String(female));
    add("employeesOthers", "Persons Employed — Others", String(others));
    add("totalEmployees", "Total Persons Employed", String(employees));
    return rows;
  }, [
    organisationName,
    orgType,
    state,
    contactName,
    email,
    mobile,
    businessDetails,
    male,
    female,
    others,
    employees,
  ]);

  const validateStep = (key: string | undefined): boolean => {
    const e: Record<string, string> = {};
    let first: string | null = null;
    const fail = (field: string, msg: string) => {
      e[field] = msg;
      if (!first) first = msg;
    };

    if (key === "profile") {
      if (!organisationName.trim())
        fail("organisationName", "Name of the enterprise is required.");
      if (!orgType) fail("orgType", "Please select the type of organisation.");
      if (!stateSlugOf(state)) fail("state", "Please select the state.");
      if (!contactName.trim()) fail("contactName", "Contact person name is required.");
      if (!EMAIL_RE.test(email.trim()))
        fail("email", "Enter a valid email address — OTPs are sent here.");
      if (!IN_MOBILE_RE.test(mobile.trim()))
        fail("mobile", "Enter a valid 10-digit mobile number — OTPs are sent here.");
    }

    if (key === "business") {
      if (!businessDetails.trim())
        fail(
          "businessDetails",
          "Please describe the business — what it does and where it operates.",
        );
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
        title,
        form: service?.form,
        name1: organisationName,
        state,
        fees: fees.lines,
        total: fees.total,
        ...formData,
      },
      `Professional_Tax_Summary_${(organisationName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <div>
      <WizardHero title={title} highlights={HIGHLIGHTS} />

      <div className="flex">
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-10 py-8 animate-in-up">
            <button
              onClick={onExit}
              className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              ← Back to service details
            </button>

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">Professional Tax · {authority}</div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Professional Tax Registration
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

            <div className="mt-6 space-y-6">
              {stepKey === "profile" && (
                <Section
                  title="Enterprise & Legal Profile"
                  desc="The registered identity of the organisation being enrolled for Professional Tax."
                >
                  <Field
                    label="Name of Enterprise (Business Name) *"
                    error={errors.organisationName}
                  >
                    <Input
                      value={organisationName}
                      onChange={setOrganisationName}
                      placeholder="e.g. Sunrise Textiles"
                      error={errors.organisationName}
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Type of Organisation *" error={errors.orgType}>
                      <Select value={orgType} onChange={setOrgType} error={errors.orgType}>
                        <option value="">-- Select --</option>
                        {ORG_TYPES.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      label="State *"
                      error={errors.state}
                      hint="The state's fee and checklist apply."
                    >
                      <Select value={state} onChange={setState} error={errors.state}>
                        {REGISTRATION_STATES.map((s) => (
                          <option key={s.slug} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div className="rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
                    <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
                    <div className="text-[11px] text-foreground/70 leading-relaxed">
                      The organisation type decides your document checklist.
                    </div>
                  </div>

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

              {stepKey === "business" && (
                <Section
                  title="Business Details"
                  desc="What the business does and how many people it employs. Your advisor confirms the figures before filing."
                >
                  <Field
                    label="Business Details *"
                    error={errors.businessDetails}
                    hint="Nature of the business, the activities carried on and the place of business."
                  >
                    <TextArea
                      value={businessDetails}
                      onChange={setBusinessDetails}
                      rows={5}
                      placeholder="e.g. Retail trading of textiles and readymade garments from a rented showroom at Banjara Hills, Hyderabad. Operating since April 2023."
                      error={errors.businessDetails}
                    />
                  </Field>

                  <div className="pt-2 border-t border-border">
                    <div className="text-xs font-medium text-foreground/90 mb-2">
                      Number of Persons Employed
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field label="Male">
                        <CountInput value={male} onChange={setMale} />
                      </Field>
                      <Field label="Female">
                        <CountInput value={female} onChange={setFemale} />
                      </Field>
                      <Field label="Others">
                        <CountInput value={others} onChange={setOthers} />
                      </Field>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      Total persons employed:{" "}
                      <span className="mono font-semibold text-foreground">{employees}</span>
                    </div>
                  </div>
                </Section>
              )}

              {stepKey === "fees" && (
                <FeesStep
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                  loading={catalogLoading || fees.loading}
                  lines={fees.lines}
                  total={fees.total}
                  heading="Estimated Professional Tax Fee Breakdown"
                  unpricedNote="Pricing for this state isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
                />
              )}

              {stepKey === "summary" && (
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
                      <div
                        key={a.key}
                        className={
                          a.key === "organisationName" || a.key === "businessDetails"
                            ? "sm:col-span-2"
                            : ""
                        }
                      >
                        <dt className="text-muted-foreground">{a.label}</dt>
                        <dd className="font-semibold text-foreground mt-0.5 break-words whitespace-pre-wrap">
                          {a.value}
                        </dd>
                      </div>
                    ))}
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
            { label: "Service", value: "Professional Tax" },
            { label: "State", value: state },
            { label: "Organisation", value: organisationName },
            { label: "Type", value: orgType },
            { label: "Persons Employed", value: String(employees) },
          ]}
          professionalFee={professionalFee}
          gstPercent={service?.gstPercent || 18}
          formNo={service?.form && service.form !== "—" ? service.form : undefined}
        />
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug={stateRowSlug}
        serviceTitle={title}
        authority={authority}
        form={service?.form && service.form !== "—" ? service.form : undefined}
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
        reason="Sign in to continue your Professional Tax application — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/professional-tax"
      />
    </div>
  );
}

function CountInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      min={0}
      onKeyDown={blockNegativeKeys}
      onChange={(e) => onChange(Math.floor(nonNegative(Number(e.target.value))))}
      className={fieldClass() + " mono"}
    />
  );
}
