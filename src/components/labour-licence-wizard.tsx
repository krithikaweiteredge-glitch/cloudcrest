import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, HardHat, Info, MapPin, ShieldCheck } from "lucide-react";
import { EntityStateWizard, REGISTRATION_STATES } from "@/components/entity-state-wizard";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useAuth } from "@/hooks/use-auth";
import { resolveDocuments, useCatalogService, type CatalogService } from "@/lib/service-catalog";
import { useFeeEstimate, type LabourFeeContext } from "@/lib/fees-api";
import { blockNegativeKeys, nonNegative } from "@/lib/number-input";
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
  fieldClass,
  format10DigitPhone,
} from "@/components/wizard-ui";

/**
 * Labour Licence (Shops & Establishments registration) — source: the client's
 * "Labour license" document.
 *
 * Registered state-wise, the way the entity registrations are: the applicant
 * picks Telangana, Andhra Pradesh or Karnataka, which opens that state's catalog
 * row (`labour-licence-<state>`, authored in Admin → Services) as the service
 * page; Start Application opens the stepper:
 *
 *   1. Enterprise & Legal Profile — name, type of organisation, state, and the
 *      contact person's email and mobile (the department's OTPs go there);
 *   2. Employment — persons employed (male / female / others), as on the MSME form;
 *   3. Fees — the backend prices the state row's fee lines plus the state's
 *      registration-fee slab on the head count;
 *   4. Summary.
 *
 * The document checklist is the state row's; the Memorandum is asked of
 * companies only.
 */

const STEPS = [
  { key: "profile", label: "Enterprise & Legal Profile" },
  { key: "employment", label: "Employment" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const ORG_TYPES = ["Proprietor", "Company", "LLP", "Partnership Firm"];

const HIGHLIGHTS = [
  { icon: HardHat, label: "Shops & Establishments Registration" },
  { icon: MapPin, label: "Telangana · Andhra Pradesh · Karnataka" },
  { icon: ShieldCheck, label: "State Labour Department" },
];

const stateSlugOf = (name: string) => REGISTRATION_STATES.find((s) => s.name === name)?.slug;

/** A checklist item that applies to companies only. */
const isCompanyOnlyDocument = (name: string) => /memorandum/i.test(name);

export function LabourLicenceWizard({ initialName }: { initialName?: string }) {
  return (
    <EntityStateWizard
      config={{
        baseSlug: "labour-licence",
        baseTitle: "Labour Licence",
        initialName,
        changeLabel: "Change state",
        hero: {
          eyebrow: "State Labour Department",
          title: "Labour Licence",
          subtitle:
            "Register your shop or establishment with the State Labour Department. Choose your state to see who can apply, the documents and the fee before you apply.",
          highlights: HIGHLIGHTS,
        },
        stateStep: {
          heading: "Select your state",
          subtitle:
            "Labour licence registration is handled state-wise — Telangana, Andhra Pradesh or Karnataka.",
        },
        renderWizard: ({ state, service, onBack, initialName }) => (
          <LabourLicenceStepper
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

function LabourLicenceStepper({
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
  const [establishmentName, setEstablishmentName] = useState(initialName);
  const [orgType, setOrgType] = useState("");
  const [state, setState] = useState(pickedState);
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  // Tab 2 — Employment.
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
  const stateRowSlug = `labour-licence-${stateSlugOf(state) ?? stateSlugOf(pickedState)}`;
  const { service: stateService, loading: catalogLoading } = useCatalogService([
    stateRowSlug,
    "labour-licence",
  ]);
  const service = stateService ?? pickedService;

  const feeContext: LabourFeeContext = { kind: "labour", slug: stateRowSlug, state, employees };
  const fees = useFeeEstimate(feeContext, !!user);
  const professionalFee = (() => {
    const line = fees.lines.find((l) => /professional/i.test(l.label))?.amount;
    return line && line > 0 ? line : null;
  })();

  const { documents: allDocuments } = resolveDocuments(service, []);
  const documents = allDocuments.filter((d) => orgType === "Company" || !isCompanyOnlyDocument(d));

  const title = `Labour Licence — ${state}`;
  const authority =
    service?.authority && service.authority !== "—" ? service.authority : "State Labour Dept.";
  const stepKey = STEPS[step]?.key;

  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string }[] = [];
    const add = (key: string, label: string, value: string) => {
      if (value.trim()) rows.push({ key, label, value: value.trim() });
    };
    add("establishmentName", "Name of Enterprise / Establishment", establishmentName);
    add("organisationType", "Type of Organisation", orgType);
    add("state", "State", state);
    add("contactName", "Contact Person Name", contactName);
    add("contactEmail", "Contact Person Email", email);
    add("contactPhone", "Contact Person Mobile", mobile);
    add("employeesMale", "Persons Employed — Male", String(male));
    add("employeesFemale", "Persons Employed — Female", String(female));
    add("employeesOthers", "Persons Employed — Others", String(others));
    add("totalEmployees", "Total Persons Employed", String(employees));
    return rows;
  }, [
    establishmentName,
    orgType,
    state,
    contactName,
    email,
    mobile,
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
      if (!establishmentName.trim())
        fail("establishmentName", "Name of the enterprise is required.");
      if (!orgType) fail("orgType", "Please select the type of organisation.");
      if (!stateSlugOf(state)) fail("state", "Please select the state.");
      if (!contactName.trim()) fail("contactName", "Contact person name is required.");
      if (!EMAIL_RE.test(email.trim()))
        fail("email", "Enter a valid email address — OTPs are sent here.");
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
        title,
        form: service?.form,
        name1: establishmentName,
        state,
        fees: fees.lines,
        total: fees.total,
        ...formData,
      },
      `Labour_Licence_Summary_${(establishmentName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
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
              <div className="label-eyebrow mb-2 text-primary">Labour Licence · {authority}</div>
              <h2 className="text-2xl font-semibold tracking-tight">Labour Licence Application</h2>
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
                  desc="The registered identity of the shop or establishment being licensed."
                >
                  <Field
                    label="Name of Enterprise (Business Name) *"
                    error={errors.establishmentName}
                  >
                    <Input
                      value={establishmentName}
                      onChange={setEstablishmentName}
                      placeholder="e.g. Sunrise Textiles"
                      error={errors.establishmentName}
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
                      hint="The state's fee slab and checklist apply."
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

              {stepKey === "employment" && (
                <Section
                  title="Employment"
                  desc="The number of persons employed sets the state's registration fee. Your advisor confirms the figures before filing."
                >
                  <div>
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
                  heading="Estimated Labour Licence Fee Breakdown"
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
                        className={a.key === "establishmentName" ? "sm:col-span-2" : ""}
                      >
                        <dt className="text-muted-foreground">{a.label}</dt>
                        <dd className="font-semibold text-foreground mt-0.5 break-words">
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
            { label: "Service", value: "Labour Licence" },
            { label: "State", value: state },
            { label: "Enterprise", value: establishmentName },
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
        reason="Sign in to continue your labour licence application — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/labour-licence"
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
