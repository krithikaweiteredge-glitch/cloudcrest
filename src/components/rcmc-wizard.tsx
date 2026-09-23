import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileBadge2,
  FileText,
  Globe,
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
 * RCMC (Registration-cum-Membership Certificate) — source: the client's
 * "RCMC.docx".
 *
 * RCMC connects an exporter with the relevant Export Promotion Council,
 * Commodity Board or other authorised registering body, via DGFT's e-RCMC
 * system. A distinct service from `iec` — an IEC is a prerequisite the
 * document lists on every applicant type's checklist, not something this
 * wizard issues.
 *
 * The document's registration workflow is a single tab, which becomes the
 * first step here:
 *
 *   Tab 1 — Applicant / Enterprise name, applicant type (eight types) and the
 *           contact person's name, email and mobile. The type picks the
 *           document checklist — the document gives one list per type, every
 *           one of them starting with the applicant's IEC.
 *
 * All of this mirrors `backend/src/config/rcmcCatalog.ts`; keep the two in
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
  { icon: Globe, label: "Export Promotion Council Registration" },
  { icon: ShieldCheck, label: "Filed via DGFT e-RCMC" },
  { icon: FileBadge2, label: "Council-Specific Benefits" },
];

const CERTIFICATES = ["Registration-cum-Membership Certificate (RCMC)"];

const ORG_TYPES = [
  "Individual / Proprietor",
  "Partnership Firm",
  "LLP",
  "Private Limited Company",
  "Public Limited Company",
  "OPC",
  "HUF",
  "Trust / Society / Other",
] as const;
type OrgType = (typeof ORG_TYPES)[number];

/** The per-type "Documents Required" lists from the document's workflow. */
const DOCS: Record<OrgType, string[]> = {
  "Individual / Proprietor": [
    "IEC",
    "Proprietor KYC",
    "Product-specific certificates, where applicable",
  ],
  "Partnership Firm": [
    "IEC",
    "Partnership Deed",
    "Authorised partner KYC",
    "Manufacturing proof, if manufacturer-exporter",
    "Product-specific certificates, where applicable",
  ],
  LLP: [
    "IEC",
    "LLP Incorporation certificate",
    "Authorisation / designated partner KYC, where required",
    "Manufacturing proof, if manufacturer-exporter",
    "Product-specific certificates, where applicable",
  ],
  "Private Limited Company": [
    "IEC",
    "Certificate of Incorporation",
    "Authorised Director details",
    "Manufacturing proof, if manufacturer-exporter",
    "Product-specific certificates, where applicable",
  ],
  "Public Limited Company": [
    "IEC",
    "Certificate of Incorporation",
    "Authorised Director details",
    "Manufacturing proof, if manufacturer-exporter",
    "Product-specific certificates, where applicable",
  ],
  OPC: [
    "IEC",
    "Certificate of Incorporation / Constitution Documents",
    "Manufacturing proof, if manufacturer-exporter",
    "Product-specific certificates, where applicable",
  ],
  HUF: [
    "IEC",
    "HUF / Karta-related supporting documents, where required",
    "Product-specific certificates, where applicable",
  ],
  "Trust / Society / Other": [
    "IEC",
    "Registration / Constitution Documents",
    "Authorisation / resolution, where required",
    "Product/service-specific certificates, where applicable",
    "Council-specific declarations / supporting documents",
  ],
};

/** The document names no form number for RCMC — filed via DGFT's e-RCMC system,
 *  not a numbered income-tax form. */
const FORM = "—";

/**
 * The document's price — ₹4,999 professional fee plus GST @ 18% (₹900) — kept
 * only as the fallback for an unpriced row. The catalog's fee lines win.
 */
const FEE_FALLBACK = { professional: 4999, govt: 0, gstPercent: 18 };

/**
 * Module entry point — the tabbed service page is the landing view and "Start
 * Application" swaps it for the stepper, the same shape as Section 332 / ICE GATE.
 */
export function RcmcModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <RcmcWizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug="rcmc" onStartApplication={() => setApplying(true)} />;
}

export function RcmcWizard({
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

  const { service, loading: catalogLoading } = useCatalogService("rcmc");

  const authority =
    service?.authority && service.authority !== "—" ? service.authority : "DGFT / EPC";

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
        title: "RCMC (Registration-cum-Membership Certificate)",
        authority,
        form,
        fees: fees.lines,
        total: fees.total,
        documents,
        details: answers.map((a) => ({ label: a.label, value: a.value })),
      },
      `RCMC_${(enterpriseName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <div>
      <WizardHero
        eyebrow="DGFT e-RCMC"
        title="RCMC (Registration-cum-Membership Certificate)"
        blurb="Guided Cloudcrest BM workspace for your Registration-cum-Membership Certificate (RCMC) — the certificate that connects your export business with the relevant Export Promotion Council or Commodity Board, filed through DGFT's e-RCMC system."
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
              <div className="label-eyebrow mb-2 text-primary">DGFT e-RCMC · {authority}</div>
              <h2 className="text-2xl font-semibold tracking-tight">RCMC Application</h2>
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
                  desc="The exporter applying for an RCMC, and who we should reach about it."
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
                  heading="RCMC — Fee Breakdown"
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
            { label: "Service", value: "RCMC (Registration-cum-Membership Certificate)" },
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
        serviceSlug="rcmc"
        serviceTitle="RCMC (Registration-cum-Membership Certificate)"
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
        reason="Sign in to continue your RCMC application — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/rcmc"
      />
    </div>
  );
}
