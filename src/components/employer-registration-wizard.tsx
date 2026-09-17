import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Coins, HeartPulse, MapPin, ShieldCheck } from "lucide-react";
import { REGISTRATION_STATES } from "@/components/entity-state-wizard";
import { ServiceDetailPage } from "@/components/service-detail-page";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useAuth } from "@/hooks/use-auth";
import { resolveDocuments, useCatalogService } from "@/lib/service-catalog";
import { useFeeEstimate, type EmployerRegistrationFeeContext } from "@/lib/fees-api";
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
 * EPF and ESI registration — source: the client's "EPFO AND ESI" document,
 * which gives both services the same application, checklist and fee.
 *
 * Each is a single catalog row (`epf` / `esi`), shown as its service page;
 * Start Application opens the stepper:
 *
 *   1. Enterprise & Legal Profile — name, type of organisation, state and the
 *      contact person;
 *   2. Employment & Business — employees (male / female) and the nature of
 *      business;
 *   3. Fees — the row's fee lines, as the admin authored them;
 *   4. Summary.
 *
 * The checklist is the row's. Items that end in a parenthesised list of
 * organisation types (e.g. "(Company / LLP)") are asked of those types only.
 */

type Slug = "epf" | "esi";

const SERVICE: Record<Slug, { title: string; authority: string; icon: typeof Coins; subtitle: string }> = {
  epf: {
    title: "EPF Registration",
    authority: "EPFO",
    icon: Coins,
    subtitle: "Employees' Provident Fund Organisation",
  },
  esi: {
    title: "ESI Registration",
    authority: "ESIC",
    icon: HeartPulse,
    subtitle: "Employees' State Insurance Corporation",
  },
};

const STEPS = [
  { key: "profile", label: "Enterprise & Legal Profile" },
  { key: "business", label: "Employment & Business" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const ORG_TYPES = ["Proprietor", "Company", "Partnership Firm", "LLP", "Society", "Trust"];

/** Whether a checklist item applies to the organisation type — see the header note. */
export function documentAppliesTo(name: string, orgType: string): boolean {
  if (!orgType) return true;
  const m = name.match(/\(([^()]+)\)\s*$/);
  if (!m) return true;
  const types = m[1].split("/").map((t) => t.trim().toLowerCase());
  // Only a parenthesis made entirely of organisation types is a rule.
  if (!types.every((t) => ORG_TYPES.some((o) => o.toLowerCase() === t))) return true;
  return types.includes(orgType.toLowerCase());
}

export function EmployerRegistrationModule({ slug, initialName }: { slug: Slug; initialName?: string }) {
  const [applying, setApplying] = useState(false);
  if (applying) {
    return <EmployerRegistrationWizard slug={slug} initialName={initialName} onExit={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug={slug} onStartApplication={() => setApplying(true)} />;
}

function EmployerRegistrationWizard({
  slug,
  initialName = "",
  onExit,
}: {
  slug: Slug;
  initialName?: string;
  onExit: () => void;
}) {
  const meta = SERVICE[slug];
  const highlights = [
    { icon: meta.icon, label: meta.subtitle },
    { icon: MapPin, label: "Telangana · Andhra Pradesh · Karnataka" },
    { icon: ShieldCheck, label: "CA / CS reviewed" },
  ];
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Tab 1 — Enterprise & Legal Profile.
  const [enterpriseName, setEnterpriseName] = useState(initialName);
  const [orgType, setOrgType] = useState("");
  const [state, setState] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  // Tab 2 — Employment & Business.
  const [male, setMale] = useState(0);
  const [female, setFemale] = useState(0);
  const [natureOfBusiness, setNatureOfBusiness] = useState("");

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

  const { service, loading: catalogLoading } = useCatalogService(slug);
  const feeContext: EmployerRegistrationFeeContext = { kind: "employer-registration", slug };
  const fees = useFeeEstimate(feeContext, !!user);
  const professionalFee = (() => {
    const line = fees.lines.find((l) => /professional/i.test(l.label))?.amount;
    return line && line > 0 ? line : null;
  })();

  const { documents: allDocuments } = resolveDocuments(service, []);
  const documents = allDocuments.filter((d) => documentAppliesTo(d, orgType));

  const title = meta.title;
  const authority = service?.authority && service.authority !== "—" ? service.authority : meta.authority;
  const form = service?.form && service.form !== "—" ? service.form : undefined;
  const stepKey = STEPS[step]?.key;

  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string }[] = [];
    const add = (key: string, label: string, value: string) => {
      if (value.trim()) rows.push({ key, label, value: value.trim() });
    };
    add("enterpriseName", "Name of Enterprise", enterpriseName);
    add("organisationType", "Type of Organisation", orgType);
    add("state", "State", state);
    add("contactName", "Contact Person Name", contactName);
    add("contactEmail", "Contact Person Mail", email);
    add("contactPhone", "Contact Person No.", mobile);
    add("employeesMale", "No. of Employees — Male", String(male));
    add("employeesFemale", "No. of Employees — Female", String(female));
    add("totalEmployees", "Total Employees", String(male + female));
    add("natureOfBusiness", "Business Details (Nature of Business)", natureOfBusiness);
    return rows;
  }, [enterpriseName, orgType, state, contactName, email, mobile, male, female, natureOfBusiness]);

  const validateStep = (key: string | undefined): boolean => {
    const e: Record<string, string> = {};
    let first: string | null = null;
    const fail = (field: string, msg: string) => {
      e[field] = msg;
      if (!first) first = msg;
    };

    if (key === "profile") {
      if (!enterpriseName.trim()) fail("enterpriseName", "Name of the enterprise is required.");
      if (!orgType) fail("orgType", "Please select the type of organisation.");
      if (!state) fail("state", "Please select the state.");
      if (!contactName.trim()) fail("contactName", "Contact person name is required.");
      if (!EMAIL_RE.test(email.trim()))
        fail("email", "Enter a valid email address — OTPs are sent here.");
      if (!IN_MOBILE_RE.test(mobile.trim()))
        fail("mobile", "Enter a valid 10-digit mobile number — OTPs are sent here.");
    }
    if (key === "business") {
      if (male + female <= 0) fail("employees", "Enter the number of employees.");
      if (!natureOfBusiness.trim()) fail("natureOfBusiness", "Please describe the nature of business.");
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
        name1: enterpriseName,
        state,
        fees: fees.lines,
        total: fees.total,
        ...formData,
      },
      `${slug.toUpperCase()}_Registration_Summary_${(enterpriseName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <div>
      <WizardHero title={title} highlights={highlights} />

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
              <div className="label-eyebrow mb-2 text-primary">
                {title} · {authority}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">{title} Application</h2>
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
                  desc="The registered identity of the establishment being registered."
                >
                  <Field label="Name of Enterprise *" error={errors.enterpriseName}>
                    <Input
                      value={enterpriseName}
                      onChange={setEnterpriseName}
                      placeholder="e.g. Sunrise Textiles"
                      error={errors.enterpriseName}
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="Type of Organisation *"
                      error={errors.orgType}
                      hint="Decides your document checklist."
                    >
                      <Select value={orgType} onChange={setOrgType} error={errors.orgType}>
                        <option value="">-- Select --</option>
                        {ORG_TYPES.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="State *" error={errors.state}>
                      <Select value={state} onChange={setState} error={errors.state}>
                        <option value="">-- Select --</option>
                        {REGISTRATION_STATES.map((s) => (
                          <option key={s.slug} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div className="pt-2 border-t border-border space-y-4">
                    <Field label="Contact Person Name *" error={errors.contactName}>
                      <Input value={contactName} onChange={setContactName} error={errors.contactName} />
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
                        label="Contact Person No. *"
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
                <>
                  <Section title="No. of Employees" desc="The number of employees in the establishment.">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Male" error={errors.employees}>
                        <CountInput value={male} onChange={setMale} error={errors.employees} />
                      </Field>
                      <Field label="Female">
                        <CountInput value={female} onChange={setFemale} error={errors.employees} />
                      </Field>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Total employees:{" "}
                      <span className="mono font-semibold text-foreground">{male + female}</span>
                    </div>
                  </Section>

                  <Section title="Business Details" desc="What the establishment does.">
                    <Field label="Nature of Business *" error={errors.natureOfBusiness}>
                      <textarea
                        rows={3}
                        value={natureOfBusiness}
                        onChange={(e) => setNatureOfBusiness(e.target.value)}
                        placeholder="e.g. Garment manufacturing and wholesale trading"
                        className={fieldClass(errors.natureOfBusiness)}
                      />
                    </Field>
                  </Section>
                </>
              )}

              {stepKey === "fees" && (
                <FeesStep
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                  loading={catalogLoading || fees.loading}
                  lines={fees.lines}
                  total={fees.total}
                  heading={`Estimated ${title} Fee Breakdown`}
                  unpricedNote="Pricing for this service isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
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
                          a.key === "enterpriseName" || a.key === "natureOfBusiness" ? "sm:col-span-2" : ""
                        }
                      >
                        <dt className="text-muted-foreground">{a.label}</dt>
                        <dd className="font-semibold text-foreground mt-0.5 break-words">{a.value}</dd>
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
            { label: "Service", value: title },
            { label: "State", value: state },
            { label: "Enterprise", value: enterpriseName },
            { label: "Employees", value: String(male + female) },
          ]}
          professionalFee={professionalFee}
          gstPercent={service?.gstPercent || 18}
          formNo={form}
        />
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug={slug}
        serviceTitle={title}
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
        reason={`Sign in to continue your ${title} application — we'll save your progress, show the fee breakdown and let you submit the application.`}
        next={`/m/${slug}`}
      />
    </div>
  );
}

function CountInput({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      min={0}
      onKeyDown={blockNegativeKeys}
      onChange={(e) => onChange(Math.floor(nonNegative(Number(e.target.value))))}
      className={fieldClass(error) + " mono"}
    />
  );
}
