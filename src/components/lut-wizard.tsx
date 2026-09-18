import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Globe,
  Info,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { ServiceDetailPage } from "@/components/service-detail-page";
import { useAuth } from "@/hooks/use-auth";
import { useCatalogService } from "@/lib/service-catalog";
import { useFeeEstimate, type LutFeeContext } from "@/lib/fees-api";
import {
  EMAIL_RE,
  Field,
  FeesStep,
  IN_MOBILE_RE,
  Input,
  NoteBox,
  PasswordInput,
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
 * Letter of Undertaking (LUT) — source: the client's "LUT.docx".
 *
 * The document's workflow is two tabs, which become the first two steps here:
 *
 *   Tab 1 — Enterprise name and the contact person's name, email and mobile.
 *           The financial year is asked here too: the document lists it under
 *           "Documents required" but an LUT is filed for one specific year, so
 *           it belongs in the form rather than as a document to chase.
 *   Tab 2 — GST portal login (optional) and two witnesses' name, occupation and
 *           address (each optional).
 *
 * The optional fields drive the checklist, exactly as the document asks: "If the
 * above optional details are not filled all those documents sections should be
 * displayed here". Anything left blank on Tab 2 becomes an upload slot at
 * submission instead — see `checklistFor`. This mirrors
 * `backend/src/config/lutCatalog.ts`; keep the two in sync.
 *
 * On the GST password: it is stored with the request so the advisor filing on
 * the customer's behalf can use it, and it is shown to the customer behind an
 * eye toggle so a typo is catchable. It is masked on the Summary step and in
 * the downloadable summary PDF — the PDF only prints what this wizard passes it,
 * so masking here is what keeps it off the document.
 *
 * Fees are not hardcoded. The document names no price, so the `lut` catalog row
 * is unpriced until the admin sets it in Admin → Services and the wizard shows
 * whatever is published.
 */

const STEPS = [
  { key: "enterprise", label: "Enterprise & Contact" },
  { key: "details", label: "GST Login & Witnesses" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const HIGHLIGHTS = [
  { icon: Globe, label: "Zero-Rated Exports Without IGST" },
  { icon: Wallet, label: "No Working Capital Blocked" },
  { icon: ShieldCheck, label: "Valid for the Full Financial Year" },
];

const LUT_CERTIFICATES = ["Letter of Undertaking (GST RFD-11) acknowledgement"];

/** The masked stand-in shown wherever the password must not be printed. */
const PASSWORD_MASK = "••••••••";

/** Documents every LUT application is asked for, whatever Tab 2 contains. */
const BASE_DOCUMENTS = [
  "GSTIN certificate",
  "Copy of the previous year's LUT (if renewing)",
  "IEC (Importer Exporter Code) — recommended if exporting goods",
];

const GST_LOGIN_DOCUMENT = "GST portal login credentials (user ID and password)";
const WITNESS_DOCUMENTS = [
  "Witness 1 details — name, occupation and complete address",
  "Witness 2 details — name, occupation and complete address",
];

/**
 * The financial years offered on Tab 1. The Indian financial year starts in
 * April, and an LUT is normally filed at or before the start of the year it
 * covers, so the list runs one year ahead and two back.
 */
function financialYears(today = new Date()): string[] {
  const start = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const label = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  return [start + 1, start, start - 1, start - 2].map(label);
}

type Witness = { name: string; occupation: string; address: string };

const emptyWitness = (): Witness => ({ name: "", occupation: "", address: "" });

/** A witness counts as entered only when all three fields are filled. */
const witnessEntered = (w: Witness) =>
  !!w.name.trim() && !!w.occupation.trim() && !!w.address.trim();

/**
 * The submit-time checklist: the base documents, plus an upload slot for each
 * optional block left blank on Tab 2.
 */
function checklistFor(gstLoginEntered: boolean, w1Entered: boolean, w2Entered: boolean): string[] {
  const list = [...BASE_DOCUMENTS];
  if (!gstLoginEntered) list.push(GST_LOGIN_DOCUMENT);
  if (!w1Entered) list.push(WITNESS_DOCUMENTS[0]);
  if (!w2Entered) list.push(WITNESS_DOCUMENTS[1]);
  return list;
}

/**
 * LUT module entry point — the service page first, the stepper behind "Start
 * Application", the same shape as MSME / IEC.
 */
export function LutModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <LutWizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug="lut" onStartApplication={() => setApplying(true)} />;
}

export function LutWizard({
  initialName,
  onBack: onExit,
}: {
  initialName?: string;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Tab 1 — Enterprise & contact.
  const YEARS = useMemo(() => financialYears(), []);
  const [enterpriseName, setEnterpriseName] = useState(initialName ?? "");
  const [financialYear, setFinancialYear] = useState(YEARS[1] ?? "");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  // Tab 2 — all optional; anything blank becomes a document slot instead.
  const [gstUserId, setGstUserId] = useState("");
  const [gstPassword, setGstPassword] = useState("");
  const [witness1, setWitness1] = useState<Witness>(emptyWitness);
  const [witness2, setWitness2] = useState<Witness>(emptyWitness);

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

  const { service, loading: catalogLoading } = useCatalogService("lut");

  const feeContext: LutFeeContext = { kind: "lut", slug: "lut", financialYear };
  const fees = useFeeEstimate(feeContext, !!user);
  const professionalFee = (() => {
    const line = fees.lines.find((l) => /professional/i.test(l.label))?.amount;
    return line && line > 0 ? line : null;
  })();

  const gstLoginEntered = !!gstUserId.trim() && !!gstPassword.trim();
  const w1Entered = witnessEntered(witness1);
  const w2Entered = witnessEntered(witness2);
  const documents = checklistFor(gstLoginEntered, w1Entered, w2Entered);

  const authority = service?.authority && service.authority !== "—" ? service.authority : "GSTN";
  const form = service?.form && service.form !== "—" ? service.form : "GST RFD-11";
  const stepKey = STEPS[step]?.key;

  /**
   * The answers, in two shapes. `value` is what is stored and sent with the
   * request — the advisor needs the real password to file. `display` is what is
   * shown on the Summary step and printed on the summary PDF, where the
   * password is masked.
   */
  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string; display: string; wide?: boolean }[] =
      [];
    const add = (
      key: string,
      label: string,
      value: string,
      opts: { display?: string; wide?: boolean } = {},
    ) => {
      const v = value.trim();
      if (!v) return;
      rows.push({ key, label, value: v, display: opts.display ?? v, wide: opts.wide });
    };
    add("enterpriseName", "Enterprise Name", enterpriseName, { wide: true });
    add("financialYear", "Financial Year", financialYear);
    add("contactName", "Contact Person Name", contactName);
    add("contactEmail", "Contact Person Email", email);
    add("contactPhone", "Contact Person Mobile", mobile);
    add("gstUserId", "GST Portal User ID", gstUserId);
    add("gstPassword", "GST Portal Password", gstPassword, { display: PASSWORD_MASK });
    add("witness1Name", "Witness 1 — Name", witness1.name);
    add("witness1Occupation", "Witness 1 — Occupation", witness1.occupation);
    add("witness1Address", "Witness 1 — Address", witness1.address, { wide: true });
    add("witness2Name", "Witness 2 — Name", witness2.name);
    add("witness2Occupation", "Witness 2 — Occupation", witness2.occupation);
    add("witness2Address", "Witness 2 — Address", witness2.address, { wide: true });
    return rows;
  }, [
    enterpriseName,
    financialYear,
    contactName,
    email,
    mobile,
    gstUserId,
    gstPassword,
    witness1,
    witness2,
  ]);

  const validateStep = (key: string | undefined): boolean => {
    const e: Record<string, string> = {};
    let first: string | null = null;
    const fail = (field: string, msg: string) => {
      e[field] = msg;
      if (!first) first = msg;
    };

    if (key === "enterprise") {
      if (!enterpriseName.trim()) fail("enterpriseName", "Enterprise name is required.");
      if (!financialYear) fail("financialYear", "Select the financial year the LUT is for.");
      if (!contactName.trim()) fail("contactName", "Contact person name is required.");
      if (!EMAIL_RE.test(email.trim()))
        fail("email", "Enter a valid email address — the GST portal's OTPs are sent here.");
      if (!IN_MOBILE_RE.test(mobile.trim()))
        fail(
          "mobile",
          "Enter a valid 10-digit mobile number — the GST portal's OTPs are sent here.",
        );
    }

    // Everything on the `details` step is optional by design: a blank block
    // becomes a document slot at submission rather than an error. The only rule
    // is that a half-filled GST login is neither one thing nor the other.
    if (key === "details") {
      const idOnly = !!gstUserId.trim() && !gstPassword.trim();
      const pwOnly = !gstUserId.trim() && !!gstPassword.trim();
      if (idOnly)
        fail(
          "gstPassword",
          "Enter the password too, or clear the user ID and upload the login instead.",
        );
      if (pwOnly)
        fail(
          "gstUserId",
          "Enter the user ID too, or clear the password and upload the login instead.",
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

  /** Stored with the request — the real values, password included. */
  const formData = Object.fromEntries(answers.map((a) => [a.key, a.value]));

  const onDownload = () =>
    downloadSummaryPdf(
      {
        title: "Letter of Undertaking (LUT)",
        authority,
        form,
        fees: fees.lines,
        total: fees.total,
        documents,
        // Masked values only — the PDF prints exactly what it is given here.
        details: answers.map((a) => ({ label: a.label, value: a.display })),
      },
      `LUT_Summary_${(enterpriseName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <div>
      <WizardHero title="Letter of Undertaking (LUT)" highlights={HIGHLIGHTS} />

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
              <div className="label-eyebrow mb-2 text-primary">GST Act, 2017 · {authority}</div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Letter of Undertaking Application
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
              {stepKey === "enterprise" && (
                <Section
                  title="Enterprise & Contact Details"
                  desc="The GST-registered enterprise filing the LUT, and who the department should reach."
                >
                  <Field label="Enterprise Name *" error={errors.enterpriseName}>
                    <Input
                      value={enterpriseName}
                      onChange={setEnterpriseName}
                      placeholder="As registered under GST"
                      error={errors.enterpriseName}
                    />
                  </Field>

                  <Field
                    label="Financial Year *"
                    error={errors.financialYear}
                    hint="An LUT covers one financial year and must be filed for each year separately."
                  >
                    <Select
                      value={financialYear}
                      onChange={setFinancialYear}
                      error={errors.financialYear}
                    >
                      <option value="">-- Select --</option>
                      {YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y}
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

              {stepKey === "details" && (
                <>
                  <Section
                    title="GST Portal Login"
                    desc="Optional. Your advisor files the LUT on the GST portal on your behalf, so the login saves a step — but you can skip it and send the credentials as a document instead."
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="GST Portal User ID" error={errors.gstUserId}>
                        <Input
                          value={gstUserId}
                          onChange={setGstUserId}
                          placeholder="GST portal username"
                          error={errors.gstUserId}
                        />
                      </Field>
                      <Field
                        label="GST Portal Password"
                        error={errors.gstPassword}
                        hint="Hidden as you type — use the eye to check it."
                      >
                        <PasswordInput
                          value={gstPassword}
                          onChange={setGstPassword}
                          placeholder="GST portal password"
                          error={errors.gstPassword}
                        />
                      </Field>
                    </div>
                    {!gstLoginEntered && (
                      <NoteBox>
                        Left blank — a slot for your GST portal login is added to the document
                        checklist and opens when you submit.
                      </NoteBox>
                    )}
                  </Section>

                  <WitnessSection
                    index={1}
                    witness={witness1}
                    onChange={setWitness1}
                    entered={w1Entered}
                  />
                  <WitnessSection
                    index={2}
                    witness={witness2}
                    onChange={setWitness2}
                    entered={w2Entered}
                  />

                  <div className="rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
                    <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
                    <div className="text-[11px] text-foreground/70 leading-relaxed">
                      Everything on this step is optional. Whatever you leave blank becomes an
                      upload slot on your document checklist —{" "}
                      <span className="font-semibold text-foreground">
                        {documents.length} document{documents.length === 1 ? "" : "s"}
                      </span>{" "}
                      so far.
                    </div>
                  </div>
                </>
              )}

              {stepKey === "fees" && (
                <FeesStep
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                  loading={catalogLoading || fees.loading}
                  lines={fees.lines}
                  total={fees.total}
                  heading="Estimated LUT Filing Fee Breakdown"
                  unpricedNote="Pricing for this service isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
                />
              )}

              {stepKey === "summary" && (
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
                          <dd
                            className={
                              "font-semibold text-foreground mt-0.5 break-words whitespace-pre-wrap" +
                              (a.key === "gstPassword" ? " mono" : "")
                            }
                          >
                            {a.display}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

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
            { label: "Service", value: "Letter of Undertaking (LUT)" },
            { label: "Enterprise", value: enterpriseName },
            { label: "Financial Year", value: financialYear },
            { label: "Documents", value: String(documents.length) },
          ]}
          professionalFee={professionalFee}
          gstPercent={service?.gstPercent || 18}
          formNo={form}
          certificates={LUT_CERTIFICATES}
        />
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="lut"
        serviceTitle="Letter of Undertaking (LUT)"
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
        reason="Sign in to continue your LUT application — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/lut"
      />
    </div>
  );
}

/** One witness block. All three fields optional; blank means "upload instead". */
function WitnessSection({
  index,
  witness,
  onChange,
  entered,
}: {
  index: number;
  witness: Witness;
  onChange: (w: Witness) => void;
  entered: boolean;
}) {
  const set = (patch: Partial<Witness>) => onChange({ ...witness, ...patch });
  const partial =
    !entered && (!!witness.name.trim() || !!witness.occupation.trim() || !!witness.address.trim());

  return (
    <Section
      title={`Witness ${index} Details`}
      desc="Optional. The LUT is signed before two independent and reliable witnesses."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name">
          <Input value={witness.name} onChange={(v) => set({ name: v })} placeholder="Full name" />
        </Field>
        <Field label="Occupation">
          <Input
            value={witness.occupation}
            onChange={(v) => set({ occupation: v })}
            placeholder="e.g. Accountant"
          />
        </Field>
      </div>
      <Field label="Complete Address">
        <TextArea
          value={witness.address}
          onChange={(v) => set({ address: v })}
          rows={3}
          placeholder="House / street, area, city, state and PIN code"
        />
      </Field>
      {!entered && (
        <NoteBox>
          {partial
            ? `Name, occupation and address are all needed for witness ${index} to count as entered — otherwise a slot for these details is added to your document checklist.`
            : `Left blank — a slot for witness ${index}'s details is added to the document checklist and opens when you submit.`}
        </NoteBox>
      )}
    </Section>
  );
}
