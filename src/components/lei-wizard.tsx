import { useEffect, useMemo, useState } from "react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { useAuth } from "@/hooks/use-auth";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useCatalogService, resolveFees } from "@/lib/service-catalog";
import { ServiceDetailPage } from "@/components/service-detail-page";
import {
  EMAIL_RE, Field, FeesStep, IN_MOBILE_RE, Input, NoteBox,
  OptionCard, Section, Select, WizardActions, WizardHero, WizardSidebar,
  downloadSummaryPdf, fetchProfileContact, format10DigitPhone,
} from "@/components/wizard-ui";
import { AlertTriangle, Globe, ShieldCheck } from "lucide-react";

/**
 * Global LEI (Legal Entity Identifier) wizard — source: "updated LEIC.html".
 *
 * Steps follow the two cards of that form, with its ownership block promoted to
 * a step of its own because GLEIF treats the parent declaration as a mandatory
 * section rather than a footnote:
 *   1 Legal Entity Profile · 2 Ownership / Parentage · 3 Authorised Party
 *
 * The HTML collects the entity and signatory documents as inline
 * <input type="file">. This app uploads after submission instead —
 * RegisterDialog turns the `documents` checklist into one upload control per
 * entry. The wizard therefore never renders the checklist itself — as a step, in
 * the rail, or on the summary. Repeating it as read-only text only put pages
 * between the applicant and the upload panel that actually takes the files.
 */
const STEPS = [
  { key: "entity", label: "Entity Profile" },
  { key: "ownership", label: "Ownership" },
  { key: "authorized", label: "Authorised Party" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

/** Legal forms exactly as the HTML `#entity_type` lists them. */
const ENTITY_TYPES = [
  { value: "PrivateLimited", label: "Private Limited Company" },
  { value: "PublicLimited", label: "Public Limited Company" },
  { value: "LLP", label: "Limited Liability Partnership (LLP)" },
  { value: "Partnership", label: "Partnership Firm" },
  { value: "SoleProprietorship", label: "Sole Proprietorship" },
  { value: "Section8", label: "Section 8 Company (Not for profit)" },
  { value: "Trust", label: "Trust" },
  { value: "Society", label: "Society" },
  { value: "ForeignCompany", label: "Foreign Company / Branch Office" },
  { value: "MutualFund", label: "Mutual Fund" },
  { value: "AIF", label: "Alternative Investment Fund (AIF)" },
  { value: "GovernmentEntity", label: "Government Entity / PSU" },
  { value: "Other", label: "Other Registration Type" },
];

/** Designations open to each legal form — HTML `entityDesignations`. */
const ENTITY_DESIGNATIONS: Record<string, string[]> = {
  PrivateLimited: ["Director", "Managing Director"],
  PublicLimited: ["Director", "Managing Director"],
  LLP: ["Designated Partner", "Partner"],
  Partnership: ["Partner"],
  SoleProprietorship: ["Proprietor"],
  Section8: ["Director"],
  Trust: ["Trustee", "Managing Trustee"],
  Society: ["President", "Secretary", "Treasurer"],
  ForeignCompany: ["Authorized Representative"],
  MutualFund: ["Fund Manager", "Signatory"],
  AIF: ["Fund Manager", "Signatory"],
  GovernmentEntity: ["Authorized Officer"],
  Other: ["Authorized Signatory"],
};

/** GLEIF entity status values (HTML card 1). */
const ENTITY_STATUSES = [
  { value: "ACTIVE", label: "ACTIVE (Operating normally)" },
  { value: "INACTIVE", label: "INACTIVE (Not operating)" },
  { value: "DISSOLVED", label: "DISSOLVED / LIQUIDATED" },
];

/** Registration authorities / registries (HTML card 1). */
const AUTHORITIES = [
  { value: "MCA", label: "Ministry of Corporate Affairs (MCA) — India" },
  { value: "RoF", label: "Registrar of Firms (RoF)" },
  { value: "SubRegistrar", label: "Sub-Registrar of Assurances (Trusts / Deeds)" },
  { value: "RBI", label: "Reserve Bank of India (RBI)" },
  { value: "SEBI", label: "Securities and Exchange Board of India (SEBI)" },
  { value: "CharityComm", label: "Charity Commissioner" },
  { value: "ForeignRegistry", label: "Foreign / International Business Registry" },
  { value: "Other", label: "Other Authority" },
];

/** GLEIF's mandatory opt-out reasons when there is no consolidating parent. */
const OPT_OUT_REASONS = [
  { value: "Natural", label: "Entity is controlled by natural person(s)" },
  { value: "NonConsolidating", label: "Controlled by entities not subject to consolidation" },
  { value: "NoKnown", label: "No known person (diversified shareholding)" },
  { value: "Legal", label: "Binding legal commitments prevent disclosure" },
];

const ENTITY_DOCS = [
  "Registration certificate — Certificate of Incorporation / registered deed",
  "Entity PAN card",
];
const SIGNATORY_DOCS = [
  "Authorised person — Aadhaar card",
  "Authorised person — PAN card",
  "Authorised person — Government ID (Passport / Voter ID)",
];
/** HTML: "Required if signatory is not a Director/Partner". */
const AUTHORITY_LETTER_DOC = "Board resolution / letter of authority for the signatory";

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "GLEIF-Standard Filing" },
  { icon: Globe, label: "20-Character Global LEI" },
];

const LEI_CERTIFICATES = ["LEI certificate — 20-character Legal Entity Identifier"];

/** ₹999 + 18% GST. The LEIL issuance charge is billed by the LOU separately and
 *  is not bundled here. Overridden by admin pricing on the `lei` catalog row. */
const FEE_FALLBACK = { professional: 999, govt: 0, gstPercent: 18 };

const LEI_CODE_RE = /^[A-Z0-9]{20}$/;

/**
 * LEI module entry point — service page first, stepper behind "Start
 * Application", the same shape as MSME / NGO Darpan.
 */
export function LeiModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <LeiWizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug="lei" onStartApplication={() => setApplying(true)} />;
}

export function LeiWizard({ initialName, onBack: onExit }: { initialName?: string; onBack?: () => void }) {
  const { user } = useAuth();

  const [step, setStep] = useState(0);

  // Step 1 — legal entity profile.
  const [legalName, setLegalName] = useState(initialName || "");
  const [entityType, setEntityType] = useState("");
  const [entityStatus, setEntityStatus] = useState("");
  const [registrationAuthority, setRegistrationAuthority] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");

  // Step 2 — ownership. No default: the HTML leaves the select unchosen.
  const [hasParent, setHasParent] = useState<"yes" | "no" | "">("");
  const [parentName, setParentName] = useState("");
  const [parentLei, setParentLei] = useState("");
  const [optOutReason, setOptOutReason] = useState("");

  // Step 3 — authorised party.
  const [signatoryName, setSignatoryName] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  /** Drives the board-resolution line on the checklist, per the HTML's note. */
  const [signatoryIsOfficer, setSignatoryIsOfficer] = useState<"yes" | "no" | "">("");

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setEmail((prev) => prev || user.email || "");
    setPhone((prev) => prev || format10DigitPhone(user.phone));
    fetchProfileContact().then((c) => {
      if (!c) return;
      setEmail((prev) => prev || c.email || user.email || "");
      setPhone((prev) => prev || c.phone || format10DigitPhone(user.phone));
    });
  }, [user]);

  const stepKey = STEPS[step]?.key;

  const entityLabel = ENTITY_TYPES.find((e) => e.value === entityType)?.label || "";
  const designations = ENTITY_DESIGNATIONS[entityType] ?? [];
  /** The HTML retitles card 2 with the designations open to the chosen form. */
  const authorizedTitle = designations.length > 0 ? designations.join(" / ") : "Authorized Party";
  const statusLabel = ENTITY_STATUSES.find((s) => s.value === entityStatus)?.label || "";
  const authorityLabel = AUTHORITIES.find((a) => a.value === registrationAuthority)?.label || "";
  const optOutLabel = OPT_OUT_REASONS.find((r) => r.value === optOutReason)?.label || "";

  // Changing the legal form invalidates a designation picked under the old one.
  useEffect(() => {
    setDesignation((prev) => (designations.includes(prev) ? prev : ""));
  }, [entityType]); // eslint-disable-line react-hooks/exhaustive-deps

  const { service, loading: catalogLoading } = useCatalogService(["lei"]);
  const fees = resolveFees(service, "LEIL", FEE_FALLBACK);
  const total = fees.total;

  const professionalFee =
    (fees.lines.find((l) => /professional/i.test(l.label))?.amount || 0) || FEE_FALLBACK.professional;

  /**
   * Checklist from the HTML's two document blocks. The letter of authority is
   * added only when the signatory is not a director / partner of the entity —
   * the condition the HTML states on that upload control.
   */
  const documents = useMemo(() => {
    const list = [...ENTITY_DOCS];
    if (signatoryIsOfficer === "no") list.push(AUTHORITY_LETTER_DOC);
    return [...list, ...SIGNATORY_DOCS];
  }, [signatoryIsOfficer]);

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    const fail = (field: string, msg: string) => {
      newErrors[field] = msg;
      if (!globalMsg) globalMsg = msg;
    };

    if (currentStep === 0) {
      if (!legalName.trim()) fail("legalName", "The entity's legal name is required.");
      if (!entityType) fail("entityType", "Please select the legal form / entity type.");
      if (!entityStatus) fail("entityStatus", "Please select the GLEIF entity status.");
      if (!registrationAuthority) fail("registrationAuthority", "Please select the registration authority.");
      if (!registrationNumber.trim()) fail("registrationNumber", "The registration number issued by that authority is required (CIN / LLPIN / registration no.).");
    } else if (currentStep === 1) {
      if (!hasParent) fail("hasParent", "Please tell us whether the entity has a direct accounting consolidating parent.");
      if (hasParent === "yes") {
        if (!parentName.trim()) fail("parentName", "The direct parent's legal name is required.");
        if (parentLei.trim() && !LEI_CODE_RE.test(parentLei.trim().toUpperCase())) {
          fail("parentLei", "An LEI is 20 alphanumeric characters — leave it blank if you don't know it.");
        }
      }
      if (hasParent === "no" && !optOutReason) {
        fail("optOutReason", "GLEIF requires an opt-out reason when there is no parent.");
      }
    } else if (currentStep === 2) {
      if (!signatoryName.trim()) fail("signatoryName", "The authorised person's name is required.");
      if (!designation) fail("designation", "Please select the authorised person's designation.");
      if (!signatoryIsOfficer) fail("signatoryIsOfficer", "Please tell us whether the signatory is a director / partner of the entity.");
      if (!EMAIL_RE.test(email.trim())) fail("email", "Enter a valid email address.");
      if (!IN_MOBILE_RE.test(phone.trim())) fail("phone", "Enter a valid 10-digit mobile number.");
    }

    setErrors(newErrors);
    setStepError(globalMsg);
    return Object.keys(newErrors).length === 0 && !globalMsg;
  };

  const next = () => {
    if (!user) {
      setOpenSignIn(true);
      return;
    }
    if (validateStep(step)) {
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

  const onDownload = () =>
    downloadSummaryPdf(
      {
        title: "Global LEI Registration",
        name1: legalName,
        form: "LEI Application",
        objects: entityLabel,
        fees: fees.lines,
        total,
      },
      `LEI_Summary_${legalName ? legalName.trim().replace(/\s+/g, "_") : "Entity"}.pdf`,
    );

  return (
    <div>
      <WizardHero
        eyebrow="GLEIF / LEIL · Legal Entity Identifier"
        title="Global LEI Registration"
        blurb="Guided Cloudcrest BM workspace for a Legal Entity Identifier — the entity's legal profile, its GLEIF status and registry, the parent declaration and the authorised signatory, through to your 20-character LEI."
        highlights={HIGHLIGHTS}
      />

      <div className="flex">
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-10 py-8 animate-in-up">
            {onExit && (
              <button
                onClick={onExit}
                className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                ← Back to LEI service details
              </button>
            )}

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">LEI Registration · GLEIF standard</div>
              <h2 className="text-2xl font-semibold tracking-tight">Global LEI Application Wizard</h2>
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

            <div className="mt-6 rounded-xl border border-warning/25 bg-warning/8 p-4 flex gap-3">
              <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
              <div className="text-xs text-foreground/80">
                <span className="font-semibold text-foreground">Must match the registry · </span>
                GLEIF validates the legal name and registration number against the registry that issued
                them. Enter both exactly as they appear on the incorporation record.
              </div>
            </div>

            <div key={step} className="mt-8 animate-in-up">
              {/* STEP 1 — ENTITY PROFILE */}
              {stepKey === "entity" && (
                <Section
                  title="Legal Entity Profile"
                  desc="How the entity is registered — GLEIF records the legal form, the status and the registry that issued the registration."
                >
                  <Field label="Legal Entity Name *" error={errors.legalName}>
                    <Input value={legalName} onChange={setLegalName} placeholder="Name exactly as on the incorporation record" error={errors.legalName} />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Legal Form / Registration Entity Type *" error={errors.entityType}>
                      <Select value={entityType} onChange={setEntityType} error={errors.entityType}>
                        <option value="">— Select exact entity type —</option>
                        {ENTITY_TYPES.map((e) => (
                          <option key={e.value} value={e.value}>{e.label}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Entity Status (GLEIF standard) *" error={errors.entityStatus}>
                      <Select value={entityStatus} onChange={setEntityStatus} error={errors.entityStatus}>
                        <option value="">— Select status —</option>
                        {ENTITY_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <Field label="Registration Authority / Registry *" error={errors.registrationAuthority}>
                    <Select value={registrationAuthority} onChange={setRegistrationAuthority} error={errors.registrationAuthority}>
                      <option value="">— Select registration authority —</option>
                      {AUTHORITIES.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </Select>
                  </Field>

                  <Field
                    label="Registration Number issued by that authority *"
                    error={errors.registrationNumber}
                    hint="CIN, LLPIN, firm registration number, trust deed number — whatever the registry above issued."
                  >
                    <Input value={registrationNumber} onChange={(v) => setRegistrationNumber(v.toUpperCase())} placeholder="e.g. U72900TG2019PTC130000" error={errors.registrationNumber} />
                  </Field>
                </Section>
              )}

              {/* STEP 2 — OWNERSHIP */}
              {stepKey === "ownership" && (
                <Section
                  title="Ownership & Parentage"
                  desc="GLEIF requires every entity to either name its direct accounting consolidating parent or record a reason for not doing so."
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <OptionCard
                      active={hasParent === "yes"}
                      onClick={() => setHasParent("yes")}
                      title="Yes — we have a direct corporate parent"
                      subtitle="A parent that consolidates this entity in its accounts."
                    />
                    <OptionCard
                      active={hasParent === "no"}
                      onClick={() => setHasParent("no")}
                      title="No — opt out"
                      subtitle="You'll pick one of GLEIF's four exception reasons."
                    />
                  </div>
                  {errors.hasParent && <p className="text-[11px] text-destructive font-medium">{errors.hasParent}</p>}

                  {hasParent === "yes" && (
                    <div className="space-y-4 pt-1">
                      <Field label="Direct Parent Legal Name *" error={errors.parentName}>
                        <Input value={parentName} onChange={setParentName} placeholder="Parent entity's registered legal name" error={errors.parentName} />
                      </Field>
                      <Field label="Direct Parent LEI (if known)" error={errors.parentLei} hint="20 alphanumeric characters. Leave blank if the parent has no LEI yet.">
                        <Input value={parentLei} onChange={(v) => setParentLei(v.toUpperCase())} placeholder="e.g. 5493001KJTIIGC8Y1R12" maxLength={20} error={errors.parentLei} />
                      </Field>
                    </div>
                  )}

                  {hasParent === "no" && (
                    <div className="pt-1">
                      <Field label="Opt-out Reason (GLEIF mandatory) *" error={errors.optOutReason}>
                        <Select value={optOutReason} onChange={setOptOutReason} error={errors.optOutReason}>
                          <option value="">— Select exception reason —</option>
                          {OPT_OUT_REASONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </Select>
                      </Field>
                      <NoteBox>
                        The reason is published on the GLEIF record alongside the LEI, so pick the one
                        that actually describes the ownership.
                      </NoteBox>
                    </div>
                  )}
                </Section>
              )}

              {/* STEP 3 — AUTHORISED PARTY */}
              {stepKey === "authorized" && (
                <Section
                  title={`${authorizedTitle} Details`}
                  desc="The person who signs the LEI application on behalf of the entity. Their designation options follow the legal form you picked in step 1."
                >
                  <Field label="Full Name of the Authorised Person *" error={errors.signatoryName}>
                    <Input value={signatoryName} onChange={setSignatoryName} placeholder="Name as per PAN" error={errors.signatoryName} />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Designation / Title *" error={errors.designation}>
                      <Select
                        value={designation}
                        onChange={setDesignation}
                        error={errors.designation}
                        disabled={designations.length === 0}
                      >
                        <option value="">
                          {designations.length === 0 ? "— Please select the entity type first —" : "— Select designation —"}
                        </option>
                        {designations.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Is the signatory a director / partner of the entity? *" error={errors.signatoryIsOfficer}>
                      <Select value={signatoryIsOfficer} onChange={(v) => setSignatoryIsOfficer(v as "yes" | "no" | "")} error={errors.signatoryIsOfficer}>
                        <option value="">— Select —</option>
                        <option value="yes">Yes — they hold office in the entity</option>
                        <option value="no">No — they sign under a letter of authority</option>
                      </Select>
                    </Field>
                  </div>

                  {signatoryIsOfficer === "no" && (
                    <NoteBox>
                      A board resolution / letter of authority has been added to your document
                      checklist — GLEIF will not accept a signature from outside the entity without it.
                    </NoteBox>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Email ID *" error={errors.email}>
                      <Input value={email} onChange={setEmail} placeholder="name@example.com" error={errors.email} type="email" />
                    </Field>
                    <Field label="Mobile Number *" error={errors.phone}>
                      <Input value={phone} onChange={setPhone} placeholder="9876543210" maxLength={10} error={errors.phone} />
                    </Field>
                  </div>
                </Section>
              )}

              {/* STEP 4 — FEES */}
              {stepKey === "fees" && (
                <FeesStep
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                  loading={catalogLoading}
                  lines={fees.lines}
                  total={total}
                  heading="Estimated LEI Fee Breakdown"
                  unpricedNote="Pricing for LEI isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
                />
              )}

              {/* STEP 6 — SUMMARY */}
              {stepKey === "summary" && (
                <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary">
                      Global LEI Application Preview
                    </div>
                    <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning font-semibold">
                      READY TO SUBMIT
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Legal Entity</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{legalName || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Legal Form</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{entityLabel || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Entity Status</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{statusLabel || "—"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Registration Authority</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{authorityLabel || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Registration Number</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">{registrationNumber || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Direct Parent</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {hasParent === "yes"
                          ? `${parentName || "—"}${parentLei ? ` · ${parentLei}` : ""}`
                          : hasParent === "no"
                            ? `Opted out — ${optOutLabel}`
                            : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Authorised Person</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{signatoryName || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Designation</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{designation || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Email</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{email || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Mobile</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">{phone || "—"}</dd>
                    </div>
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
            { label: "Legal Form", value: entityLabel },
            { label: "Entity Status", value: entityStatus },
          ]}
          professionalFee={professionalFee}
          gstPercent={FEE_FALLBACK.gstPercent}
          certificates={LEI_CERTIFICATES}
        />
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="lei"
        serviceTitle="Global LEI Registration"
        authority="LEIL"
        initialEmail={email}
        initialPhone={phone}
        formData={{
          legalName,
          entityType,
          entityTypeLabel: entityLabel,
          entityStatus,
          registrationAuthority: authorityLabel || registrationAuthority,
          registrationNumber,
          hasDirectParent: hasParent,
          ...(hasParent === "yes"
            ? { parentName, ...(parentLei.trim() ? { parentLei: parentLei.toUpperCase() } : {}) }
            : {}),
          ...(hasParent === "no" ? { optOutReason: optOutLabel || optOutReason } : {}),
          signatoryName,
          designation,
          signatoryIsOfficer,
          email,
          phone,
        }}
        documents={documents}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your Global LEI registration — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/lei"
      />
    </div>
  );
}
