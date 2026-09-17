import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileBadge2, Info, MapPin, ShieldCheck } from "lucide-react";
import { EntityStateWizard, REGISTRATION_STATES } from "@/components/entity-state-wizard";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useAuth } from "@/hooks/use-auth";
import { resolveDocuments, useCatalogService, type CatalogService } from "@/lib/service-catalog";
import { useFeeEstimate, type TradeLicenceFeeContext } from "@/lib/fees-api";
import { blockNegativeKeys, nonNegative } from "@/lib/number-input";
import { ROAD_WIDTHS, resolveRoadWidthRates, type RoadWidthKey } from "@/lib/trade-licence-rates";
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
 * Trade Licence — source: the client's "Trade License" document.
 *
 * Registered state-wise like the Labour Licence: the applicant picks Telangana,
 * Andhra Pradesh or Karnataka, which opens that state's catalog row
 * (`trade-licence-<state>`, authored in Admin → Services) as the service page;
 * Start Application opens the stepper:
 *
 *   1. Enterprise & Legal Profile — name, type of organisation, state and the
 *      contact person;
 *   2. Business Details — the road width the premises fronts (one option) and
 *      the area in sq.ft.;
 *   3. Fees — the backend prices the state row's fee lines plus the Govt Fee,
 *      area × the row's per-sq.ft. rate for the road width;
 *   4. Summary.
 */

const STEPS = [
  { key: "profile", label: "Enterprise & Legal Profile" },
  { key: "business", label: "Business Details" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const ORG_TYPES = ["Proprietor", "Company", "LLP", "Partnership"];

const HIGHLIGHTS = [
  { icon: FileBadge2, label: "Municipal Trade Licence" },
  { icon: MapPin, label: "Telangana · Andhra Pradesh · Karnataka" },
  { icon: ShieldCheck, label: "Municipal Corporation" },
];

const stateSlugOf = (name: string) => REGISTRATION_STATES.find((s) => s.name === name)?.slug;

export function TradeLicenceWizard({ initialName }: { initialName?: string }) {
  return (
    <EntityStateWizard
      config={{
        baseSlug: "trade-licence",
        baseTitle: "Trade Licence",
        initialName,
        changeLabel: "Change state",
        hero: {
          eyebrow: "Municipal Corporation",
          title: "Trade Licence",
          subtitle:
            "Get the municipal trade licence for your business premises. Choose your state to see who can apply, the documents and the fee before you apply.",
          highlights: HIGHLIGHTS,
        },
        stateStep: {
          heading: "Select your state",
          subtitle: "Trade licences are issued state-wise — Telangana, Andhra Pradesh or Karnataka.",
        },
        renderWizard: ({ state, service, onBack, initialName }) => (
          <TradeLicenceStepper
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

function TradeLicenceStepper({
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

  // Tab 2 — Business Details.
  const [roadWidth, setRoadWidth] = useState<RoadWidthKey | "">("");
  const [area, setArea] = useState(0);

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
  // checklist, fee lines and road-width rates.
  const stateRowSlug = `trade-licence-${stateSlugOf(state) ?? stateSlugOf(pickedState)}`;
  const { service: stateService, loading: catalogLoading } = useCatalogService([
    stateRowSlug,
    "trade-licence",
  ]);
  const service = stateService ?? pickedService;
  const rates = resolveRoadWidthRates(service?.wizardRules);
  const roadWidthLabel = ROAD_WIDTHS.find((w) => w.key === roadWidth)?.label ?? "";

  const feeContext: TradeLicenceFeeContext = {
    kind: "trade-licence",
    slug: stateRowSlug,
    state,
    roadWidth,
    area,
  };
  const fees = useFeeEstimate(feeContext, !!user);
  const professionalFee = (() => {
    const line = fees.lines.find((l) => /professional/i.test(l.label))?.amount;
    return line && line > 0 ? line : null;
  })();

  const { documents } = resolveDocuments(service, []);

  const title = `Trade Licence — ${state}`;
  const authority =
    service?.authority && service.authority !== "—" ? service.authority : "Municipal Corp.";
  const stepKey = STEPS[step]?.key;

  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string }[] = [];
    const add = (key: string, label: string, value: string) => {
      if (value.trim()) rows.push({ key, label, value: value.trim() });
    };
    add("establishmentName", "Name of the Enterprise", establishmentName);
    add("organisationType", "Type of Organisation", orgType);
    add("state", "State", state);
    add("contactName", "Contact Person Name", contactName);
    add("contactEmail", "Contact Person Email", email);
    add("contactPhone", "Contact Person Mobile", mobile);
    add("roadWidth", "Road Width", roadWidthLabel);
    add("areaSqft", "Area (sq.ft.)", area > 0 ? String(area) : "");
    return rows;
  }, [establishmentName, orgType, state, contactName, email, mobile, roadWidthLabel, area]);

  const validateStep = (key: string | undefined): boolean => {
    const e: Record<string, string> = {};
    let first: string | null = null;
    const fail = (field: string, msg: string) => {
      e[field] = msg;
      if (!first) first = msg;
    };

    if (key === "profile") {
      if (!establishmentName.trim()) fail("establishmentName", "Name of the enterprise is required.");
      if (!orgType) fail("orgType", "Please select the type of organisation.");
      if (!stateSlugOf(state)) fail("state", "Please select the state.");
      if (!contactName.trim()) fail("contactName", "Contact person name is required.");
      if (!EMAIL_RE.test(email.trim()))
        fail("email", "Enter a valid email address — OTPs are sent here.");
      if (!IN_MOBILE_RE.test(mobile.trim()))
        fail("mobile", "Enter a valid 10-digit mobile number — OTPs are sent here.");
    }
    if (key === "business") {
      if (!roadWidth) fail("roadWidth", "Please select the road width.");
      if (!(area > 0)) fail("area", "Enter the area of the premises in sq.ft.");
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
      `Trade_Licence_Summary_${(establishmentName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
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
              <div className="label-eyebrow mb-2 text-primary">Trade Licence · {authority}</div>
              <h2 className="text-2xl font-semibold tracking-tight">Trade Licence Application</h2>
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
                  desc="The registered identity of the business being licensed."
                >
                  <Field label="Name of the Enterprise *" error={errors.establishmentName}>
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
                      hint="The state's rates and checklist apply."
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

              {stepKey === "business" && (
                <>
                  <Section
                    title="Road Width"
                    desc="The width of the road your premises fronts sets the Govt Fee rate. Select one."
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {ROAD_WIDTHS.map((w) => {
                        const selected = roadWidth === w.key;
                        return (
                          <button
                            key={w.key}
                            type="button"
                            onClick={() => setRoadWidth(w.key)}
                            aria-pressed={selected}
                            className={`text-left rounded-xl border p-3.5 transition-colors cursor-pointer ${
                              selected
                                ? "border-primary bg-primary/8 ring-1 ring-primary"
                                : errors.roadWidth
                                  ? "border-destructive/60 hover:border-primary/50"
                                  : "border-border hover:border-primary/50"
                            }`}
                          >
                            <div className="text-xs font-semibold text-foreground">{w.label}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground mono">
                              ₹{rates[w.key].toLocaleString("en-IN")} per sq.ft.
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  <Section title="Business Details" desc="The area of the premises being licensed.">
                    <Field
                      label="Area (sq.ft.) *"
                      error={errors.area}
                      hint={
                        roadWidth && area > 0
                          ? `Govt Fee: ${area.toLocaleString("en-IN")} sq.ft. × ₹${rates[roadWidth]} = ₹${Math.round(area * rates[roadWidth]).toLocaleString("en-IN")}`
                          : "Govt Fee = area × the rate for the road width."
                      }
                    >
                      <input
                        type="number"
                        value={area || ""}
                        min={0}
                        onKeyDown={blockNegativeKeys}
                        onChange={(e) => setArea(nonNegative(Number(e.target.value)))}
                        placeholder="e.g. 500"
                        className={fieldClass(errors.area) + " mono"}
                      />
                    </Field>
                    <div className="rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
                      <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
                      <div className="text-[11px] text-foreground/70 leading-relaxed">
                        Your advisor confirms the road width and area before filing.
                      </div>
                    </div>
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
                  heading="Estimated Trade Licence Fee Breakdown"
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
            { label: "Service", value: "Trade Licence" },
            { label: "State", value: state },
            { label: "Enterprise", value: establishmentName },
            { label: "Road Width", value: roadWidthLabel },
            { label: "Area", value: area > 0 ? `${area.toLocaleString("en-IN")} sq.ft.` : "" },
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
        reason="Sign in to continue your trade licence application — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/trade-licence"
      />
    </div>
  );
}
