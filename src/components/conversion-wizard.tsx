import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Info, Landmark, Loader2, ShieldCheck } from "lucide-react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { ServiceDetailPage } from "@/components/service-detail-page";
import { useAuth } from "@/hooks/use-auth";
import { useCatalogService, resolveDocuments, resolveFees } from "@/lib/service-catalog";
import { resolveConversionRules, ruleLines } from "@/lib/conversion-rules";
import { useMcaNameCheck, type McaNameCheckResult } from "@/lib/use-mca-name-check";
import { INDIAN_STATES, INDUSTRY_TYPES } from "@/lib/form-options";
import {
  Field,
  FeesStep,
  Input,
  Section,
  Select,
  TextArea,
  WizardActions,
  WizardHero,
  WizardSidebar,
  downloadSummaryPdf,
} from "@/components/wizard-ui";

/**
 * Business Conversion stepper — source: business-conversions-portal.html.
 *
 * One stepper serves every `conversion-*` catalog service. What is NOT in this
 * file, because it is admin-managed on the service's catalog row:
 *
 *   - the page copy (About / Who can Apply / Acts and Rules) — shown on the
 *     service page before Start Application;
 *   - the required-document checklist — `document_types`, turned into upload
 *     slots by RegisterDialog at submission, not listed inside a step;
 *   - the eligibility rules, statutory minimums and per-step notes —
 *     `wizardRules`, see lib/conversion-rules;
 *   - fees — the service's fee lines.
 *
 * What IS here is the form's shape: which inputs each conversion asks for. The
 * HTML varies it per type (an OPC → Pvt application states the existing company
 * and its new member/director counts; an LLP → Pvt application proposes a new
 * company name), and that is structure, like every other wizard's fields. A
 * conversion an admin adds that isn't listed below falls back to a minimal
 * layout — existing name, office — so it still works.
 */

type NameKind = "existing" | "existingWithCin" | "proposedCompany" | "proposedCompanyShort" | "proposedLlp";
type MembersKind = "currentProposed" | "counts" | "partners" | null;
type CapitalKind = "paidUpOnly" | "authorisedPaid" | "contribution" | null;

type ConversionLayout = {
  name: NameKind;
  namePlaceholder: string;
  members: MembersKind;
  capital: CapitalKind;
};

const LAYOUTS: Record<string, ConversionLayout> = {
  "conversion-pvt-to-opc": {
    name: "existing",
    namePlaceholder: "Enter existing company name",
    members: null,
    capital: "paidUpOnly",
  },
  "conversion-pvt-to-public": {
    name: "existing",
    namePlaceholder: "e.g. ABC PRIVATE LIMITED",
    members: "currentProposed",
    capital: "authorisedPaid",
  },
  "conversion-llp-to-pvt": {
    name: "proposedCompany",
    namePlaceholder: "e.g. ZENIN TECH SERVICES PRIVATE LIMITED",
    members: "counts",
    capital: "authorisedPaid",
  },
  "conversion-opc-to-pvt": {
    name: "existing",
    namePlaceholder: "e.g. ABC (OPC) PRIVATE LIMITED",
    members: "counts",
    capital: "authorisedPaid",
  },
  "conversion-proprietorship-to-pvt": {
    name: "proposedCompany",
    namePlaceholder: "e.g. ZENIN ENTERPRISES PRIVATE LIMITED",
    members: null,
    capital: "authorisedPaid",
  },
  "conversion-partnership-to-llp": {
    name: "proposedLlp",
    namePlaceholder: "e.g. ZENIN TECH ADVISORS",
    members: "partners",
    capital: "contribution",
  },
  "conversion-partnership-to-pvt": {
    name: "proposedCompanyShort",
    namePlaceholder: "e.g. ZENIN TECH ADVISORS PRIVATE LIMITED",
    members: "counts",
    capital: "authorisedPaid",
  },
  "conversion-public-to-pvt": {
    name: "existingWithCin",
    namePlaceholder: "Enter existing public company name",
    members: "currentProposed",
    capital: null,
  },
};

const GENERIC_LAYOUT: ConversionLayout = {
  name: "existing",
  namePlaceholder: "Enter existing entity name",
  members: null,
  capital: null,
};

const CIN_RE = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;
const PIN_RE = /^\d{6}$/;

const HIGHLIGHTS = [
  { icon: Landmark, label: "Registrar of Companies (ROC) filing" },
  { icon: ArrowLeftRight, label: "Entity conversion" },
  { icon: ShieldCheck, label: "Eligibility checked up front" },
];

/** Catalog page first (admin-managed copy), then the stepper on Start Application. */
export function ConversionModule({ slug, initialName }: { slug: string; initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <ConversionWizard slug={slug} initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug={slug} onStartApplication={() => setApplying(true)} />;
}

const toInt = (v: string) => {
  const n = Number(v);
  return v.trim() !== "" && Number.isInteger(n) ? n : NaN;
};
const toAmount = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return v.trim() !== "" && Number.isFinite(n) ? n : NaN;
};

export function ConversionWizard({
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

  // The conversion is fixed by the page the applicant opened — each one has its
  // own sidebar entry — so the Type step confirms it rather than re-offering all.
  const { service, loading: catalogLoading } = useCatalogService([slug]);

  const layout = LAYOUTS[slug] ?? GENERIC_LAYOUT;
  const rules = resolveConversionRules(service?.wizardRules);

  // Step 2 — name.
  const [existingName, setExistingName] = useState(initialName || "");
  const [cin, setCin] = useState("");
  const [name1, setName1] = useState(initialName || "");
  const [name2, setName2] = useState("");
  const [industryType, setIndustryType] = useState("");
  const [objects, setObjects] = useState("");

  // Step 3 — members & directors / partners.
  const [currentShareholders, setCurrentShareholders] = useState("");
  const [currentDirectors, setCurrentDirectors] = useState("");
  const [proposedShareholders, setProposedShareholders] = useState("");
  const [proposedDirectors, setProposedDirectors] = useState("");
  const [shareholders, setShareholders] = useState("");
  const [directors, setDirectors] = useState("");
  const [partners, setPartners] = useState("");

  // Step 4 — registered office. No defaults: the HTML's prefilled Hyderabad
  // address was demo data.
  const [address, setAddress] = useState("");
  const [officeState, setOfficeState] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");

  // Step 5 — capital.
  const [authorisedCapital, setAuthorisedCapital] = useState("");
  const [paidUpCapital, setPaidUpCapital] = useState("");
  const [contribution, setContribution] = useState("");

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

  // Pre-fill the member counts from the type's minimums, as the HTML does
  // (e.g. OPC → Pvt opens at 2 shareholders / 2 directors).
  useEffect(() => {
    const min = (n: number | null) => (n ? String(n) : "");
    setShareholders((v) => v || min(rules.minShareholders));
    setDirectors((v) => v || min(rules.minDirectors));
    setProposedShareholders((v) => v || min(rules.minShareholders));
    setProposedDirectors((v) => v || min(rules.minDirectors));
    setPartners((v) => v || min(rules.minPartners));
  }, [slug, service?.wizardRules]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(() => {
    const list = [{ key: "name", label: "Name" }];
    if (layout.members) {
      list.push({ key: "members", label: layout.members === "partners" ? "Partners" : "Members & Directors" });
    }
    list.push({ key: "office", label: "Office" });
    if (layout.capital) list.push({ key: "capital", label: "Capital" });
    list.push({ key: "fees", label: "Fees" }, { key: "summary", label: "Summary" });
    return list;
  }, [layout]);

  const stepKey = steps[step]?.key;

  const authority = service?.authority || "MCA";
  const fees = resolveFees(service, authority, { professional: 0, govt: 0, gstPercent: 18 });
  // The admin's professional fee, or null (the sidebar then omits the row).
  // When the service has fee lines, only a line labelled "Professional Fee"
  // counts: the admin editor also writes the lines' total into the
  // professional-fee column, which would otherwise present a charge such as the
  // newspaper-advertisement cost as the professional fee.
  const professionalFee = (() => {
    if ((service?.feeLines ?? []).length > 0) {
      const line = fees.lines.find((l) => /professional/i.test(l.label))?.amount;
      return line && line > 0 ? line : null;
    }
    const column = service?.professionalFee;
    return column && column > 0 ? column : null;
  })();
  const { documents } = resolveDocuments(service, []);
  const title = service?.title || "Business Conversion";

  const isProposed = layout.name.startsWith("proposed");
  const entityName = isProposed ? name1 : existingName;

  // MCA availability for a proposed name, as in the Company and LLP wizards.
  // Existing-company conversions keep their registered name, so nothing to check.
  const nameSuffix = layout.name === "proposedLlp" ? "LLP" : "";
  const name1Mca = useMcaNameCheck(isProposed ? name1 : "", nameSuffix);
  const name2Mca = useMcaNameCheck(isProposed && layout.name !== "proposedCompanyShort" ? name2 : "", nameSuffix);

  /** Everything the applicant entered, labelled — drives the summary, the PDF and the filed request. */
  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string | number }[] = [];
    const add = (key: string, label: string, value: string | number) => {
      if (value !== "" && !(typeof value === "number" && Number.isNaN(value))) rows.push({ key, label, value });
    };

    add("conversionType", "Conversion Type", title);

    if (layout.name === "existing" || layout.name === "existingWithCin") {
      add("existingEntityName", "Existing Company Name", existingName.trim());
      if (layout.name === "existingWithCin") add("cin", "CIN of the Company", cin.trim().toUpperCase());
    } else {
      const llp = layout.name === "proposedLlp";
      add("name1", llp ? "Proposed LLP Name 1" : "Proposed Company Name 1", llp ? `${name1.trim()} LLP` : name1.trim());
      if (layout.name !== "proposedCompanyShort" && name2.trim()) {
        add("name2", llp ? "Proposed LLP Name 2" : "Proposed Company Name 2", llp ? `${name2.trim()} LLP` : name2.trim());
      }
      if (layout.name === "proposedCompany") add("industryType", "Industry Type", industryType);
      add("objects", "Main Objects / Business Activity", objects.trim());
    }

    if (layout.members === "currentProposed") {
      add("currentShareholders", "Current Number of Shareholders", toInt(currentShareholders));
      add("currentDirectors", "Current Number of Directors", toInt(currentDirectors));
      add("proposedShareholders", "Proposed Number of Shareholders", toInt(proposedShareholders));
      add("proposedDirectors", "Proposed Number of Directors", toInt(proposedDirectors));
    } else if (layout.members === "counts") {
      add("shareholders", "Number of Shareholders", toInt(shareholders));
      add("directors", "Number of Directors", toInt(directors));
    } else if (layout.members === "partners") {
      add("designatedPartners", "Number of Designated Partners", toInt(partners));
    }

    add("address", "Registered Office Address", address.trim());
    add("state", "State", officeState);
    add("city", "City", city.trim());
    add("pincode", "PIN Code", pincode.trim());

    if (layout.capital === "paidUpOnly") {
      add("paidUpCapital", "Existing Paid-up Capital", toAmount(paidUpCapital));
    } else if (layout.capital === "authorisedPaid") {
      add("authorisedCapital", "Authorised Share Capital", toAmount(authorisedCapital));
      add("paidUpCapital", "Paid-up Share Capital", toAmount(paidUpCapital));
    } else if (layout.capital === "contribution") {
      add("capitalContribution", "Total Capital Contribution (As Per Books)", toAmount(contribution));
    }

    return rows;
  }, [
    title, layout, existingName, cin, name1, name2, industryType, objects,
    currentShareholders, currentDirectors, proposedShareholders, proposedDirectors,
    shareholders, directors, partners, address, officeState, city, pincode,
    authorisedCapital, paidUpCapital, contribution,
  ]);

  const validateStep = (key: string | undefined): boolean => {
    const e: Record<string, string> = {};
    let first: string | null = null;
    const fail = (field: string, msg: string) => {
      e[field] = msg;
      if (!first) first = msg;
    };

    /** A required whole number, optionally bounded by the type's admin-set limits. */
    const checkCount = (field: string, raw: string, label: string, min?: number | null, max?: number | null) => {
      const n = toInt(raw);
      if (Number.isNaN(n) || n < 1) return fail(field, `${label} is required.`);
      if (min && n < min) return fail(field, `${label} must be at least ${min}.`);
      if (max && n > max) return fail(field, `${label} can be at most ${max}.`);
    };
    const checkAmount = (field: string, raw: string, label: string) => {
      const n = toAmount(raw);
      if (Number.isNaN(n) || n <= 0) fail(field, `Enter the ${label.toLowerCase()} in rupees.`);
    };

    if (key === "name") {
      if (layout.name === "existing" || layout.name === "existingWithCin") {
        if (!existingName.trim()) fail("existingName", "Existing company name is required.");
        if (layout.name === "existingWithCin") {
          if (!cin.trim()) fail("cin", "CIN of the company is required.");
          else if (!CIN_RE.test(cin.trim().toUpperCase())) {
            fail("cin", "Enter a valid 21-character CIN (e.g. L12345MH2010PLC123456).");
          }
        }
      } else {
        if (!name1.trim()) fail("name1", "Proposed name is required.");
        else if (layout.name === "proposedCompany" && !/private limited$/i.test(name1.trim())) {
          fail("name1", 'The proposed company name must end with "Private Limited".');
        } else if (name1Mca.result && !name1Mca.result.ok) {
          fail("name1", name1Mca.result.msg);
        }
        if (!objects.trim()) fail("objects", "Main objects / business activity is required.");
      }
    } else if (key === "members") {
      if (layout.members === "currentProposed") {
        checkCount("currentShareholders", currentShareholders, "Current number of shareholders");
        checkCount("currentDirectors", currentDirectors, "Current number of directors");
        checkCount(
          "proposedShareholders",
          proposedShareholders,
          "Proposed number of shareholders",
          rules.minShareholders,
          rules.maxShareholders,
        );
        checkCount("proposedDirectors", proposedDirectors, "Proposed number of directors", rules.minDirectors);
      } else if (layout.members === "counts") {
        checkCount("shareholders", shareholders, "Number of shareholders", rules.minShareholders, rules.maxShareholders);
        checkCount("directors", directors, "Number of directors", rules.minDirectors);
      } else if (layout.members === "partners") {
        checkCount("partners", partners, "Number of designated partners", rules.minPartners);
      }
    } else if (key === "office") {
      if (!address.trim()) fail("address", "Registered office address is required.");
      if (!officeState) fail("officeState", "Please select the state.");
      if (!city.trim()) fail("city", "City is required.");
      if (!PIN_RE.test(pincode.trim())) fail("pincode", "Enter a valid 6-digit PIN code.");
    } else if (key === "capital") {
      if (layout.capital === "paidUpOnly") {
        checkAmount("paidUpCapital", paidUpCapital, "Existing paid-up capital");
      } else if (layout.capital === "authorisedPaid") {
        checkAmount("authorisedCapital", authorisedCapital, "Authorised share capital");
        checkAmount("paidUpCapital", paidUpCapital, "Paid-up share capital");
        const a = toAmount(authorisedCapital);
        const p = toAmount(paidUpCapital);
        if (!Number.isNaN(a) && !Number.isNaN(p) && p > a) {
          fail("paidUpCapital", "Paid-up capital cannot exceed the authorised capital.");
        }
      } else if (layout.capital === "contribution") {
        checkAmount("contribution", contribution, "Total capital contribution");
      }
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
      setStep((s) => Math.min(steps.length - 1, s + 1));
      setStepError(null);
      setErrors({});
    }
  };

  const back = () => {
    setStep((s) => Math.max(0, s - 1));
    setStepError(null);
    setErrors({});
  };

  const capitalFigure =
    layout.capital === "contribution" ? toAmount(contribution) : toAmount(authorisedCapital);
  const paidFigure = toAmount(paidUpCapital);

  const formData = Object.fromEntries(answers.map((a) => [a.key, a.value]));

  const onDownload = () =>
    downloadSummaryPdf(
      {
        title,
        form: service?.form,
        name1: entityName,
        objects: objects || undefined,
        state: officeState,
        ...(Number.isNaN(capitalFigure) ? {} : { capital: capitalFigure }),
        fees: fees.lines,
        total: fees.total,
        ...formData,
      },
      `Conversion_Summary_${(entityName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  const eligibility = ruleLines(rules.eligibility);

  return (
    <div>
      <WizardHero title={title} highlights={HIGHLIGHTS} />

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
                Business Conversion · {authority}
                {service?.form ? ` · ${service.form}` : ""}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">Entity Conversion Wizard</h2>
            </div>

            {/* The type's eligibility rules and minimums sit above the form, not
                inside a step — the conversion itself is fixed by the page. */}
            {eligibility.length > 0 && (
              <div className="mb-6">
                <RuleBanner tone="warning" title="Eligibility & Rules">
                  <ul className="space-y-1 list-disc pl-4">
                    {eligibility.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </RuleBanner>
              </div>
            )}

            <div className="rounded-xl border border-border bg-surface shadow-card p-4">
              <Stepper
                steps={steps}
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
              {/* STEP — NAME */}
              {stepKey === "name" && (
                <Section
                  title={isProposed ? "Proposed name" : "Existing company"}
                  desc={
                    isProposed
                      ? "The name the converted entity will be registered under."
                      : "The company being converted, exactly as registered with the ROC."
                  }
                >
                  {(layout.name === "existing" || layout.name === "existingWithCin") && (
                    <>
                      <Field label="Existing Company Name *" error={errors.existingName}>
                        <Input
                          value={existingName}
                          onChange={setExistingName}
                          placeholder={layout.namePlaceholder}
                          error={errors.existingName}
                        />
                      </Field>
                      {layout.name === "existingWithCin" && (
                        <Field label="CIN of the Company *" error={errors.cin}>
                          <Input
                            value={cin}
                            onChange={(v) => setCin(v.toUpperCase())}
                            placeholder="L12345MH2010PLC123456"
                            maxLength={21}
                            error={errors.cin}
                          />
                        </Field>
                      )}
                    </>
                  )}

                  {isProposed && (
                    <>
                      <Field
                        label={
                          layout.name === "proposedLlp"
                            ? "Proposed LLP Name 1 *"
                            : layout.name === "proposedCompany"
                              ? 'Proposed Company Name 1 (must end with "Private Limited") *'
                              : "Proposed Company Name 1 *"
                        }
                        error={errors.name1}
                      >
                        <SuffixInput
                          value={name1}
                          onChange={setName1}
                          placeholder={layout.namePlaceholder}
                          suffix={layout.name === "proposedLlp" ? "LLP" : undefined}
                          error={errors.name1}
                        />
                        <McaNameStatus checking={name1Mca.checking} result={name1Mca.result} />
                      </Field>
                      {layout.name !== "proposedCompanyShort" && (
                        <Field
                          label={layout.name === "proposedLlp" ? "Proposed LLP Name 2 (Optional)" : "Proposed Company Name 2 (Optional)"}
                        >
                          <SuffixInput
                            value={name2}
                            onChange={setName2}
                            placeholder={layout.name === "proposedLlp" ? "e.g. ZENIN INNOVATION ADVISORS" : "e.g. ZENIN SOLUTIONS PRIVATE LIMITED"}
                            suffix={layout.name === "proposedLlp" ? "LLP" : undefined}
                          />
                          <McaNameStatus checking={name2Mca.checking} result={name2Mca.result} />
                        </Field>
                      )}
                      {layout.name === "proposedCompany" && (
                        <Field label="Industry Type">
                          <Select value={industryType} onChange={setIndustryType}>
                            <option value="">Select industry type…</option>
                            {INDUSTRY_TYPES.map((i) => (
                              <option key={i} value={i}>
                                {i}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      )}
                      <Field label="Main Objects / Business Activity *" error={errors.objects}>
                        <TextArea
                          value={objects}
                          onChange={setObjects}
                          rows={3}
                          placeholder="Specify main objects of business activity"
                          error={errors.objects}
                        />
                      </Field>
                    </>
                  )}

                  {rules.notes.name && <RuleBanner tone="info">{rules.notes.name}</RuleBanner>}
                </Section>
              )}

              {/* STEP — MEMBERS & DIRECTORS / PARTNERS */}
              {stepKey === "members" && (
                <Section
                  title={layout.members === "partners" ? "Designated partners" : "Members & directors"}
                  desc={
                    layout.members === "currentProposed"
                      ? "Today's numbers and the numbers after conversion."
                      : "The numbers the converted entity will have."
                  }
                >
                  {rules.notes.members && (
                    <RuleBanner tone={layout.members === "currentProposed" ? "warning" : "info"}>
                      {rules.notes.members}
                    </RuleBanner>
                  )}

                  {layout.members === "currentProposed" && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Current Number of Shareholders *" error={errors.currentShareholders}>
                          <Input type="number" value={currentShareholders} onChange={setCurrentShareholders} placeholder="e.g. 2" error={errors.currentShareholders} />
                        </Field>
                        <Field label="Current Number of Directors *" error={errors.currentDirectors}>
                          <Input type="number" value={currentDirectors} onChange={setCurrentDirectors} placeholder="e.g. 2" error={errors.currentDirectors} />
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field
                          label="Proposed Number of Shareholders *"
                          error={errors.proposedShareholders}
                          hint={limitHint(rules.minShareholders, rules.maxShareholders)}
                        >
                          <Input type="number" value={proposedShareholders} onChange={setProposedShareholders} error={errors.proposedShareholders} />
                        </Field>
                        <Field
                          label="Proposed Number of Directors *"
                          error={errors.proposedDirectors}
                          hint={limitHint(rules.minDirectors, null)}
                        >
                          <Input type="number" value={proposedDirectors} onChange={setProposedDirectors} error={errors.proposedDirectors} />
                        </Field>
                      </div>
                    </>
                  )}

                  {layout.members === "counts" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field
                        label="Number of Shareholders *"
                        error={errors.shareholders}
                        hint={limitHint(rules.minShareholders, rules.maxShareholders)}
                      >
                        <Input type="number" value={shareholders} onChange={setShareholders} error={errors.shareholders} />
                      </Field>
                      <Field label="Number of Directors *" error={errors.directors} hint={limitHint(rules.minDirectors, null)}>
                        <Input type="number" value={directors} onChange={setDirectors} error={errors.directors} />
                      </Field>
                    </div>
                  )}

                  {layout.members === "partners" && (
                    <Field
                      label="Number of Designated Partners *"
                      error={errors.partners}
                      hint={limitHint(rules.minPartners, null)}
                    >
                      <Input type="number" value={partners} onChange={setPartners} error={errors.partners} />
                    </Field>
                  )}
                </Section>
              )}

              {/* STEP — OFFICE */}
              {stepKey === "office" && (
                <Section title="Registered office" desc="Where the converted entity will be registered.">
                  <Field label="Registered Office Address *" error={errors.address}>
                    <Input value={address} onChange={setAddress} placeholder="Registered office address" error={errors.address} />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="State *" error={errors.officeState}>
                      <Select value={officeState} onChange={setOfficeState} error={errors.officeState}>
                        <option value="">Select state…</option>
                        {INDIAN_STATES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="City *" error={errors.city}>
                      <Input value={city} onChange={setCity} placeholder="City" error={errors.city} />
                    </Field>
                    <Field label="PIN Code *" error={errors.pincode}>
                      <Input
                        value={pincode}
                        onChange={(v) => setPincode(v.replace(/\D/g, ""))}
                        placeholder="6-digit PIN"
                        maxLength={6}
                        error={errors.pincode}
                      />
                    </Field>
                  </div>
                </Section>
              )}

              {/* STEP — CAPITAL */}
              {stepKey === "capital" && (
                <Section title="Capital" desc="Figures in rupees.">
                  {layout.capital === "paidUpOnly" && (
                    <Field label="Existing Paid-up Capital (as per last audited Balance Sheet) *" error={errors.paidUpCapital}>
                      <Input value={paidUpCapital} onChange={setPaidUpCapital} placeholder="e.g. 100000" error={errors.paidUpCapital} />
                    </Field>
                  )}
                  {layout.capital === "authorisedPaid" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Authorised Share Capital *" error={errors.authorisedCapital}>
                        <Input value={authorisedCapital} onChange={setAuthorisedCapital} placeholder="e.g. 1000000" error={errors.authorisedCapital} />
                      </Field>
                      <Field label="Paid-up Share Capital *" error={errors.paidUpCapital}>
                        <Input value={paidUpCapital} onChange={setPaidUpCapital} placeholder="e.g. 100000" error={errors.paidUpCapital} />
                      </Field>
                    </div>
                  )}
                  {layout.capital === "contribution" && (
                    <Field label="Total Capital Contribution of Firm – As Per Books *" error={errors.contribution}>
                      <Input value={contribution} onChange={setContribution} placeholder="e.g. 500000" error={errors.contribution} />
                    </Field>
                  )}
                  {rules.notes.capital && <RuleBanner tone="info">{rules.notes.capital}</RuleBanner>}
                </Section>
              )}

              {/* STEP — FEES */}
              {stepKey === "fees" && (
                <>
                  <FeesStep
                    signedIn={!!user}
                    onSignIn={() => setOpenSignIn(true)}
                    loading={catalogLoading}
                    lines={fees.lines}
                    total={fees.total}
                    heading="Estimated Conversion Fee Breakdown"
                    unpricedNote="Pricing for this conversion isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
                  />
                </>
              )}

              {/* STEP — SUMMARY */}
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
                      <div key={a.key} className={a.key === "objects" || a.key === "address" || a.key === "conversionType" ? "sm:col-span-2" : ""}>
                        <dt className="text-muted-foreground">{a.label}</dt>
                        <dd className="font-semibold text-foreground mt-0.5 break-words whitespace-pre-line">
                          {typeof a.value === "number" && /capital|contribution/i.test(a.key)
                            ? `₹ ${a.value.toLocaleString("en-IN")}`
                            : String(a.value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <WizardActions
                step={step}
                stepCount={steps.length}
                nextLabel={steps[step + 1]?.label}
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
            { label: "Conversion", value: title },
            { label: isProposed ? "Proposed Name" : "Company", value: entityName },
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
        capital={Number.isNaN(capitalFigure) ? undefined : capitalFigure}
        paidCapital={Number.isNaN(paidFigure) ? undefined : paidFigure}
        formData={formData}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your business conversion — we'll save your progress, show the fee breakdown and let you submit the application."
        next={`/m/${slug}`}
      />
    </div>
  );
}

/** The live MCA registry result under a proposed-name field. */
function McaNameStatus({ checking, result }: { checking: boolean; result: McaNameCheckResult | null }) {
  if (checking) {
    return (
      <div className="mt-2 text-[11px] text-primary flex items-center gap-1.5 font-medium">
        <Loader2 className="size-3 animate-spin" /> Checking MCA registry availability…
      </div>
    );
  }
  if (!result) return null;
  return (
    <div
      className={
        "mt-2 text-[11px] flex items-center gap-1.5 font-medium " +
        (result.ok ? "text-success" : "text-destructive")
      }
    >
      {result.ok ? <CheckCircle2 className="size-3.5 shrink-0" /> : <AlertTriangle className="size-3.5 shrink-0" />}
      <span>{result.msg}</span>
    </div>
  );
}

function limitHint(min: number | null, max: number | null): string | undefined {
  if (min && max) return `Between ${min} and ${max}`;
  if (min) return `Minimum ${min}`;
  if (max) return `Maximum ${max}`;
  return undefined;
}

function RuleBanner({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning";
  title?: string;
  children: React.ReactNode;
}) {
  const warning = tone === "warning";
  const Icon = warning ? AlertTriangle : Info;
  return (
    <div
      className={
        "rounded-xl border p-4 flex gap-3 text-xs leading-relaxed " +
        (warning ? "border-warning/30 bg-warning/8" : "border-primary/25 bg-primary/[0.05]")
      }
    >
      <Icon className={"size-4 shrink-0 mt-0.5 " + (warning ? "text-warning" : "text-primary")} />
      <div className="text-foreground/85 min-w-0">
        {title && <div className="font-semibold text-foreground mb-1">{title}</div>}
        {children}
      </div>
    </div>
  );
}

/** Text input with a fixed legal suffix shown inside the field (the HTML's "LLP"). */
function SuffixInput({
  value,
  onChange,
  placeholder,
  suffix,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  error?: string;
}) {
  if (!suffix) return <Input value={value} onChange={onChange} placeholder={placeholder} error={error} />;
  return (
    <div className="relative">
      <Input value={value} onChange={onChange} placeholder={placeholder} error={error} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
        {suffix}
      </span>
    </div>
  );
}
