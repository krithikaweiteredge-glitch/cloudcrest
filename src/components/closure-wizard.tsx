import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, FileText, Landmark, Loader2 } from "lucide-react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { ServiceDetailPage } from "@/components/service-detail-page";
import { REGISTRATION_STATES } from "@/components/entity-state-wizard";
import { useAuth } from "@/hooks/use-auth";
import {
  useCatalogFamily,
  useCatalogService,
  resolveDocuments,
  resolveFees,
  type CatalogService,
} from "@/lib/service-catalog";
import { INDIAN_STATES } from "@/lib/form-options";
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
  format10DigitPhone,
} from "@/components/wizard-ui";

/**
 * Business Closure — source: business-closure-application.html, with the copy
 * from the two closure docx files.
 *
 * Everything about a closure except the shape of its form lives on its catalog
 * row and is edited in Admin → Services: the service page (About / Who can
 * Apply / Documents / Acts, plus the docx's extra sections as tabs), the
 * document checklist the upload panel turns into slots, and the fee lines.
 *
 * Flow, as elsewhere in the app:
 *
 *   - Trust and Section 8 closures first ask which kind — Public / Private
 *     trust, or Section 8's conversion vs liquidation route. The choices are the
 *     parent's sub-type rows in the catalog, so the admin controls them; the
 *     Section 8 page's About explains why there are two routes.
 *   - The chosen (or only) closure opens its service page; Start Application
 *     opens the stepper: Details → Fees → Summary.
 *
 * The Details step is the HTML's "Basic Details" card: company, LLP and
 * Section 8 closures ask for the full set (legal name, CIN/LLPIN, office state
 * from all states, contact, reason); partnership, trust, society and Nidhi ask
 * for name, state (Telangana / Andhra Pradesh / Karnataka) and reason.
 */

type ClosureLayout = {
  details: "full" | "basic";
  regLabel?: string;
  regKey?: "cin" | "llpin";
};

const CIN: ClosureLayout = { details: "full", regLabel: "CIN (Corporate Identification Number)", regKey: "cin" };
const LLPIN: ClosureLayout = { details: "full", regLabel: "LLPIN (LLP Identification Number)", regKey: "llpin" };
const BASIC: ClosureLayout = { details: "basic" };

const LAYOUTS: Record<string, ClosureLayout> = {
  "closure-pvt": CIN,
  "closure-public": CIN,
  "closure-opc": CIN,
  "closure-llp": LLPIN,
  "closure-sec8-conversion": CIN,
  "closure-sec8-liquidation": CIN,
  "closure-partnership": BASIC,
  "closure-trust-public": BASIC,
  "closure-trust-private": BASIC,
  "closure-society": BASIC,
  "closure-nidhi": BASIC,
};

/** Closures whose applicant first picks a sub-type, each with its own service page. */
const TYPE_PICKER_BASES = new Set(["closure-trust", "closure-sec8"]);

/** A sub-type an admin adds later follows its family's form. */
function layoutFor(slug: string): ClosureLayout {
  if (LAYOUTS[slug]) return LAYOUTS[slug];
  if (slug.startsWith("closure-sec8-")) return CIN;
  return BASIC;
}

/** Closures this module handles. Proprietorship has no source content, so it keeps the plain service page. */
export function isClosureSlug(slug: string): boolean {
  return slug in LAYOUTS || TYPE_PICKER_BASES.has(slug);
}

function heroHighlights(service: CatalogService | null | undefined) {
  const list: { icon: typeof Landmark; label: string }[] = [];
  if (service?.authority) list.push({ icon: Landmark, label: service.authority });
  if (service?.form && service.form !== "—") list.push({ icon: FileText, label: `Form · ${service.form}` });
  return list;
}

export function ClosureModule({ slug, initialName }: { slug: string; initialName?: string }) {
  if (TYPE_PICKER_BASES.has(slug)) return <ClosureTypePicker baseSlug={slug} initialName={initialName} />;
  return <ClosureServiceFlow slug={slug} initialName={initialName} />;
}

/** Service page first, then the stepper on Start Application. */
function ClosureServiceFlow({
  slug,
  initialName,
  onBack,
  backLabel,
}: {
  slug: string;
  initialName?: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <ClosureWizard slug={slug} initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return (
    <ServiceDetailPage
      slug={slug}
      onBack={onBack}
      backLabel={backLabel}
      onStartApplication={() => setApplying(true)}
    />
  );
}

/** Pick which kind of Trust / Section 8 closure, before its service page opens. */
function ClosureTypePicker({ baseSlug, initialName }: { baseSlug: string; initialName?: string }) {
  const { service: base } = useCatalogService([baseSlug]);
  const { variants } = useCatalogFamily(baseSlug);
  const [picked, setPicked] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);

  // Sub-type rows are inactive by design (so they stay out of the sidebar); the
  // family endpoint returns them regardless.
  const types = (variants ?? []).filter((v) => v.slug && v.slug.startsWith(`${baseSlug}-`));
  const pickedType = types.find((t) => t.slug === picked) ?? null;

  if (opened) {
    return (
      <ClosureServiceFlow
        key={opened}
        slug={opened}
        initialName={initialName}
        onBack={() => setOpened(null)}
        backLabel="Change type"
      />
    );
  }

  return (
    <div>
      <WizardHero title={base?.title || "Business Closure"} highlights={heroHighlights(base)} />

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <div>
          <div className="label-eyebrow mb-2 text-primary">Step 1 · Type</div>
          <h2 className="text-2xl font-semibold tracking-tight">Choose the type</h2>
          {base?.description?.trim() && (
            <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line leading-relaxed max-w-3xl">
              {base.description}
            </p>
          )}
        </div>

        {variants === undefined ? (
          <div className="py-10 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" /> Loading types…
          </div>
        ) : types.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            No types have been published for this closure yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {types.map((t) => {
              const active = picked === t.slug;
              return (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => setPicked(t.slug)}
                  className={
                    "group text-left p-5 rounded-xl border shadow-card ring-focus transition-all " +
                    (active
                      ? "border-primary bg-primary/[0.06] ring-2 ring-primary/30"
                      : "border-border bg-surface hover:border-primary/50 hover-lift")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={
                        "size-11 rounded-xl grid place-items-center transition-all " +
                        (active
                          ? "gradient-brand text-white shadow-brand"
                          : "bg-primary/10 text-primary group-hover:gradient-brand group-hover:text-white")
                      }
                    >
                      <FileText className="size-5" />
                    </span>
                    {active && <Check className="size-4 text-primary" />}
                  </div>
                  <div className="mt-4 text-sm font-semibold leading-snug">{t.name}</div>
                  {t.formNo && t.formNo !== "—" && (
                    <div className="mt-1 text-[12px] text-muted-foreground">Form · {t.formNo}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {pickedType && (
          <div className="animate-in-up flex items-center justify-between gap-4 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] to-accent/[0.05] p-5">
            <div className="min-w-0 text-sm font-semibold">{pickedType.name}</div>
            <button
              type="button"
              onClick={() => setOpened(pickedType.slug)}
              className="group shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl gradient-brand text-white text-sm font-bold uppercase tracking-wide shadow-brand hover:shadow-elev hover:-translate-y-0.5 transition-all"
            >
              Next
              <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const STEPS = [
  { key: "details", label: "Details" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

export function ClosureWizard({
  slug,
  initialName,
  onBack: onExit,
}: {
  slug: string;
  initialName?: string;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  const { service, loading: catalogLoading } = useCatalogService([slug]);
  const layout = layoutFor(slug);
  const full = layout.details === "full";

  const [entityName, setEntityName] = useState(initialName || "");
  const [regNo, setRegNo] = useState("");
  const [officeState, setOfficeState] = useState("");
  const [contactName, setContactName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  // Prefill the contact fields the full form asks for, as the other wizards do.
  useEffect(() => {
    if (!user || !full) return;
    setEmail((prev) => prev || user.email || "");
    setMobile((prev) => prev || format10DigitPhone(user.phone));
    fetchProfileContact().then((c) => {
      if (!c) return;
      setEmail((prev) => prev || c.email);
      setMobile((prev) => prev || c.phone);
    });
  }, [user, full]);

  const stepKey = STEPS[step]?.key;
  const title = service?.title || "Business Closure";
  const authority = service?.authority || "";
  const stateOptions = full ? INDIAN_STATES : REGISTRATION_STATES.map((s) => s.name);

  const fees = resolveFees(service, authority || "Government", { professional: 0, govt: 0, gstPercent: 18 });
  const { documents } = resolveDocuments(service, []);

  // The admin's professional fee, or null (the sidebar then leaves the row out).
  // With fee lines, only a line labelled "Professional Fee" counts — a line such
  // as the STK-2 government fee must not be shown as the professional fee.
  const professionalFee = (() => {
    if ((service?.feeLines ?? []).length > 0) {
      const line = fees.lines.find((l) => /professional/i.test(l.label))?.amount;
      return line && line > 0 ? line : null;
    }
    const column = service?.professionalFee;
    return column && column > 0 ? column : null;
  })();

  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string }[] = [];
    const add = (key: string, label: string, value: string) => {
      if (value.trim()) rows.push({ key, label, value: value.trim() });
    };
    add("closureType", "Closure Type", title);
    add("entityName", full ? "Legal Name of Entity" : "Name of the Entity", entityName);
    if (full && layout.regKey && layout.regLabel) add(layout.regKey, layout.regLabel, regNo.toUpperCase());
    add("state", full ? "Registered Office State" : "State", officeState);
    if (full) {
      add("contactPerson", "Primary Contact Person Name", contactName);
      add("applicantMobile", "Mobile Number", mobile);
      add("applicantEmail", "Email Address", email);
    }
    add("reasonForClosure", full ? "Reason for Closure" : "Reason for Resolving / Closure", reason);
    return rows;
  }, [title, full, layout, entityName, regNo, officeState, contactName, mobile, email, reason]);

  const validateStep = (key: string | undefined): boolean => {
    const e: Record<string, string> = {};
    let first: string | null = null;
    const fail = (field: string, msg: string) => {
      e[field] = msg;
      if (!first) first = msg;
    };

    if (key === "details") {
      if (!entityName.trim()) fail("entityName", "Name of the entity is required.");
      if (full && !regNo.trim()) fail("regNo", `${layout.regLabel} is required.`);
      if (!officeState) fail("officeState", "Please select the state.");
      if (full) {
        if (!contactName.trim()) fail("contactName", "Primary contact person name is required.");
        if (!IN_MOBILE_RE.test(mobile.trim())) fail("mobile", "Enter a valid 10-digit mobile number.");
        if (!EMAIL_RE.test(email.trim())) fail("email", "Enter a valid email address.");
      }
      if (!reason.trim()) fail("reason", "Please give the reason for closure.");
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
        name1: entityName,
        state: officeState,
        fees: fees.lines,
        total: fees.total,
        ...formData,
      },
      `Closure_Summary_${(entityName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <div>
      <WizardHero title={title} highlights={heroHighlights(service)} />

      <div className="flex">
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-10 py-8 animate-in-up">
            {onExit && (
              <button
                onClick={onExit}
                className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                ← Back to service details
              </button>
            )}

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">
                Business Closure{authority ? ` · ${authority}` : ""}
                {service?.form && service.form !== "—" ? ` · ${service.form}` : ""}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">Closure Application</h2>
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
              {stepKey === "details" && (
                <Section title="Basic Details of the Entity">
                  <Field
                    label={full ? "Legal Name of Entity (as per registration documents)" : "Name of the Entity"}
                    error={errors.entityName}
                  >
                    <Input
                      value={entityName}
                      onChange={setEntityName}
                      placeholder={full ? "Enter full legal name" : "Enter full name of the entity"}
                      error={errors.entityName}
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {full && (
                      <Field label={layout.regLabel ?? ""} error={errors.regNo}>
                        <Input
                          value={regNo}
                          onChange={(v) => setRegNo(v.toUpperCase())}
                          placeholder="Enter identification number"
                          error={errors.regNo}
                        />
                      </Field>
                    )}
                    <Field label={full ? "Registered Office State" : "State"} error={errors.officeState}>
                      <Select value={officeState} onChange={setOfficeState} error={errors.officeState}>
                        <option value="">-- Select State --</option>
                        {stateOptions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  {full && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Primary Contact Person Name" error={errors.contactName}>
                          <Input value={contactName} onChange={setContactName} error={errors.contactName} />
                        </Field>
                        <Field label="Mobile Number" error={errors.mobile}>
                          <Input
                            value={mobile}
                            onChange={(v) => setMobile(v.replace(/\D/g, ""))}
                            placeholder="10-digit mobile"
                            maxLength={10}
                            error={errors.mobile}
                          />
                        </Field>
                      </div>
                      <Field label="Email Address (for official communication)" error={errors.email}>
                        <Input type="email" value={email} onChange={setEmail} error={errors.email} />
                      </Field>
                    </>
                  )}

                  <Field label={full ? "Reason for Closure" : "Reason for Resolving / Closure"} error={errors.reason}>
                    <TextArea
                      value={reason}
                      onChange={setReason}
                      rows={full ? 2 : 3}
                      placeholder={
                        full
                          ? "e.g. Business discontinued, no operations for last 2 years, etc."
                          : "Briefly mention the reason for dissolution / closure"
                      }
                      error={errors.reason}
                    />
                  </Field>
                </Section>
              )}

              {stepKey === "fees" && (
                <FeesStep
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                  loading={catalogLoading}
                  lines={fees.lines}
                  total={fees.total}
                  heading="Estimated Closure Fee Breakdown"
                  unpricedNote="Pricing for this closure isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
                />
              )}

              {stepKey === "summary" && (
                <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary">Consolidated Summary</div>
                    <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning font-semibold">
                      READY TO SUBMIT
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {answers.map((a) => (
                      <div
                        key={a.key}
                        className={
                          a.key === "closureType" || a.key === "entityName" || a.key === "reasonForClosure"
                            ? "sm:col-span-2"
                            : ""
                        }
                      >
                        <dt className="text-muted-foreground">{a.label}</dt>
                        <dd className="font-semibold text-foreground mt-0.5 break-words whitespace-pre-line">{a.value}</dd>
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
            { label: "Closure", value: title },
            { label: "Entity", value: entityName },
            { label: "State", value: officeState },
          ]}
          professionalFee={professionalFee}
          gstPercent={service?.gstPercent || 18}
          formNo={service?.form && service.form !== "—" ? service.form : undefined}
        />
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug={slug}
        serviceTitle={title}
        authority={authority}
        form={service?.form && service.form !== "—" ? service.form : undefined}
        documents={documents}
        initialName={full ? contactName : undefined}
        initialEmail={full ? email : undefined}
        initialPhone={full ? mobile : undefined}
        formData={formData}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your closure application — we'll save your progress, show the fee breakdown and let you submit the application."
        next={`/m/${slug}`}
      />
    </div>
  );
}
