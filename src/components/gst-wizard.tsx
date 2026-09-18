import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  FileDown,
  CheckCircle2,
  FileText,
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
import { useFeeEstimate, type GstFeeContext } from "@/lib/fees-api";
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
 * GST Registration — source: the client's "GST_Registration_changes.docx".
 *
 * The document lays the service out as three pages, which map onto the picker
 * plus the stepper below:
 *
 *   1. Select service / taxpayer type — the nine cards in `GST_TYPES`. The
 *      document lists eleven categories and asks for the last three to appear
 *      as one "Other Registrations" card, so that card's `covers` names all
 *      three; they share a document checklist.
 *   2. State / UT, constitution of business and contact details — the
 *      `business` step.
 *   3. A document checklist that changes with the constitution of business and
 *      the taxpayer type — the `documents` step, which is also the checklist
 *      the applicant uploads against when submitting.
 *
 * Then Fees and Summary, as every other wizard has them.
 *
 * Fees are NOT hardcoded here. The document prices every GST registration at
 * ₹2,499 + ₹450 GST, but that is only the value seeded onto the catalog rows by
 * `backend/src/scripts/backfill-gst.ts`; the amount shown comes from
 * `POST /api/fees/estimate` for the `gst-<type>` row, so the admin owns it in
 * Admin → Services and can price each type differently.
 *
 * `GST_CONSTITUTION_DOCUMENTS` / `TYPE_ADDITIONAL_DOCUMENTS` mirror
 * `backend/src/config/gstCatalog.ts` — keep the two in sync.
 */

const STEPS = [
  { key: "business", label: "Business & Contact" },
  { key: "documents", label: "Document Checklist" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Eligibility Guidance" },
  { icon: Zap, label: "Category-wise Documents" },
  { icon: ClipboardList, label: "Guided Application" },
  { icon: FileDown, label: "Tracked Submission" },
];

/* -------------------------------------------------------------------------- *
 * Page 2 — constitution of business.
 * -------------------------------------------------------------------------- */

/** The eight entity types the document lists, in its order. */
const CONSTITUTIONS = [
  "Proprietorship / Individual",
  "Partnership Firm",
  "Limited Liability Partnership (LLP)",
  "Private Limited Company",
  "Public Limited Company",
  "One Person Company",
  "Hindu Undivided Family (HUF)",
  "Society / Club / Association of Persons (AOP) / Body of Individuals (BOI)",
];

/* -------------------------------------------------------------------------- *
 * Page 3 — the dynamic checklist.
 * -------------------------------------------------------------------------- */

const TRADE_NAME_DOC =
  "Supporting Document for Trade Name (Trade licence or any other government licence certificate)";

/** The document's six constitution-wise checklists, verbatim and in its order. */
const GST_CONSTITUTION_DOCUMENTS: Record<string, string[]> = {
  proprietorship: [
    "PAN of Proprietor",
    "Aadhaar of Proprietor",
    "Photograph of Proprietor",
    "Proof of Principal Place of Business",
    "Electricity Bill",
    "Rental Agreement / NOC",
    TRADE_NAME_DOC,
    "Bank Account Proof",
  ],
  partnership: [
    "PAN of Firm",
    "PAN of all Partners",
    "Aadhaar of all Partners",
    "Partnership Deed",
    "Photos of Partners (including the Managing Partner)",
    "Mail and Mobile of all Partners",
    "Proof of Principal Place of Business",
    "Electricity Bill",
    "Rental Agreement / NOC",
    TRADE_NAME_DOC,
    "Bank Proof",
  ],
  company: [
    "PAN of Entity",
    "Certificate of Incorporation",
    "Photos of Directors",
    "Aadhaar of all Directors",
    "PAN of all Directors",
    "Mail and Mobile of all Directors",
    "Proof of Principal Place of Business",
    "Electricity Bill",
    "Rental Agreement / NOC",
    TRADE_NAME_DOC,
    "Bank Proof",
  ],
  // The document's LLP block asks for the Aadhaar / PAN / contact details "of
  // all Directors" — the Company block's wording. An LLP has designated
  // partners, as the same block's photo line says, so they are written for
  // designated partners here.
  llp: [
    "PAN of Entity",
    "Certificate of Incorporation",
    "Photos of Designated Partners",
    "Aadhaar of all Designated Partners",
    "PAN of all Designated Partners",
    "Mail and Mobile of all Designated Partners",
    "Proof of Principal Place of Business",
    "Electricity Bill",
    "Rental Agreement / NOC",
    TRADE_NAME_DOC,
    "Bank Proof",
  ],
  huf: [
    "PAN of HUF",
    "Aadhaar of Karta",
    "Photo and details of Karta",
    "Proof of Principal Place of Business",
    "Electricity Bill",
    "Rental Agreement / NOC",
    TRADE_NAME_DOC,
    "Bank Proof",
  ],
  society: [
    "PAN of Society",
    "PAN of all Members",
    "Aadhaar of all Members",
    "Society By-laws",
    "Photos of all Members",
    "Mail and Mobile of all Members",
    "Proof of Principal Place of Business",
    "Electricity Bill",
    "Rental Agreement / NOC",
    TRADE_NAME_DOC,
    "Bank Proof",
  ],
};

/** Which of the six checklists each constitution uses. */
const CHECKLIST_OF_CONSTITUTION: Record<string, keyof typeof GST_CONSTITUTION_DOCUMENTS> = {
  "Proprietorship / Individual": "proprietorship",
  "Partnership Firm": "partnership",
  "Limited Liability Partnership (LLP)": "llp",
  "Private Limited Company": "company",
  "Public Limited Company": "company",
  "One Person Company": "company",
  "Hindu Undivided Family (HUF)": "huf",
  "Society / Club / Association of Persons (AOP) / Body of Individuals (BOI)": "society",
};

/**
 * The document's "Additional docs for special type of registrations", layered on
 * top of the constitution checklist. The "Other Registrations" card stands in
 * for three categories, so its list is the union of the document's
 * non-resident-online-provider and UIN items; the document names no extra
 * documents for an SEZ developer or unit.
 */
const TYPE_ADDITIONAL_DOCUMENTS: Record<string, string[]> = {
  nrtp: [
    "Bank Account Proof",
    "Passport / TIN / unique identification number of the foreign entity (as applicable)",
    "Clearance certificate / Certificate of Incorporation / Licence from the country of origin",
  ],
  other: [
    "Proof of Bank Accounts",
    "Passport / TIN / unique identification number of the foreign entity (as applicable)",
    "Clearance certificate / Certificate of Incorporation / Licence from the country of origin (for OIDAR)",
    "MEA letter / relevant notification details (as applicable, for UIN)",
  ],
  tds: [
    "Documents as prescribed for the specific category (constitution documents, Authorised Signatory and Bank proof)",
    "Details of the Drawing and Disbursing Officer (DDO), where applicable",
  ],
  tcs: [
    "Documents as prescribed for the specific category (constitution documents, Authorised Signatory and Bank proof)",
    "Details of the Drawing and Disbursing Officer (DDO), where applicable",
  ],
};

/**
 * The checklist for one (constitution × taxpayer type), split so the step can
 * label each group. `extra` drops anything the constitution already asks for.
 */
function checklistFor(constitution: string, typeKey: string): { base: string[]; extra: string[] } {
  const listKey = CHECKLIST_OF_CONSTITUTION[constitution.trim()];
  const base = listKey ? GST_CONSTITUTION_DOCUMENTS[listKey] : [];
  const seen = new Set(base.map((d) => d.toLowerCase()));
  const extra = (TYPE_ADDITIONAL_DOCUMENTS[typeKey] ?? []).filter(
    (d) => !seen.has(d.toLowerCase()),
  );
  return { base, extra };
}

/* -------------------------------------------------------------------------- *
 * Page 1 — the taxpayer types.
 * -------------------------------------------------------------------------- */

/**
 * The general "Documents required" list the service page shows. The page can't
 * know the applicant's constitution yet — that is asked on the next page — so it
 * shows the common set and the wizard narrows it on the checklist step. Used
 * only as a fallback; the admin's list on the catalog row wins.
 */
const GENERAL_DOCS = [
  "PAN of the business / applicant",
  "Aadhaar of the proprietor / partners / directors",
  "Photograph of the proprietor / partners / directors",
  "Proof of Principal Place of Business",
  "Electricity Bill",
  "Rental Agreement / NOC",
  TRADE_NAME_DOC,
  "Bank Account Proof",
  "Constitution document (Partnership Deed / Certificate of Incorporation / Society By-laws, as applicable)",
  "Mail and Mobile of all Partners / Directors / Members",
];

const GST_TYPES: RegistrationType[] = [
  {
    key: "regular",
    title: "Normal Scheme (Regular)",
    short: "Regular",
    form: "REG-01",
    tags: ["Most common", "Full ITC"],
    popular: true,
    blurb: "Standard registration for businesses crossing the turnover threshold.",
    about:
      "The normal scheme is the standard GST registration for businesses that cross the prescribed turnover threshold or otherwise make taxable supplies. A regular taxpayer collects GST from customers, claims input tax credit on eligible purchases and files periodic returns.\n\nThis is the most common category and suits the majority of trading, manufacturing and service businesses.",
    who: [
      "Aggregate turnover above ₹40 lakh (goods) or ₹20 lakh (services).",
      "₹20 lakh / ₹10 lakh threshold for special-category states.",
      "Anyone making regular taxable supplies of goods or services.",
    ],
    docs: GENERAL_DOCS,
  },
  {
    key: "rule-14a",
    title: "Normal Scheme — Under Rule 14A",
    short: "Rule 14A",
    form: "REG-01",
    tags: ["Certificate in 3 days", "Aadhaar authenticated"],
    blurb: "The simplified route — registration certificate within 3 days.",
    about:
      "Rule 14A is the simplified, optional route to a normal GST registration for small taxpayers. An applicant who opts in and completes Aadhaar authentication is granted the registration certificate within three working days, instead of waiting out the standard verification timeline.\n\nEverything else works exactly as it does under the normal scheme — the taxpayer collects GST, claims input tax credit and files the same periodic returns.",
    who: [
      "Applicants for a normal registration who opt for the Rule 14A route.",
      "Aadhaar authentication of the authorised signatory is required.",
      "Registration certificate is granted within 3 working days.",
    ],
    docs: GENERAL_DOCS,
  },
  {
    key: "composition",
    title: "Composition Scheme",
    short: "Composition",
    form: "REG-01 · CMP-02",
    tags: ["Flat rate", "Turnover ≤ ₹1.5 Cr"],
    blurb: "A flat-rate scheme for small taxpayers with simpler compliance.",
    about:
      "The composition scheme is a simplified GST option for small taxpayers. Instead of the regular rates, eligible businesses pay tax at a low flat rate on turnover, file quarterly and enjoy much lighter compliance.\n\nThe trade-off: a composition dealer cannot collect GST from customers or claim input tax credit, and cannot make inter-state supplies or supply through e-commerce operators.",
    who: [
      "Aggregate turnover up to ₹1.5 crore (₹75 lakh for special-category states).",
      "Pay tax at a flat rate; cannot collect tax from customers or claim ITC.",
      "Not available to inter-state suppliers or supplies through e-commerce operators.",
    ],
    docs: GENERAL_DOCS,
  },
  {
    key: "casual",
    title: "Casual Taxable Person (CTP)",
    short: "CTP",
    form: "REG-01",
    tags: ["Occasional", "Advance tax"],
    blurb: "For occasional supplies in a state where you have no fixed place of business.",
    about:
      "A casual taxable person occasionally supplies goods or services in a state or union territory where they have no fixed place of business — for example at an exhibition, trade fair or seasonal stall.\n\nRegistration is required before supply begins, and an advance deposit of the estimated tax liability is payable. The registration is valid for up to 90 days and can be extended once.",
    who: [
      "A person who occasionally supplies goods / services where they have no fixed establishment.",
      "Typical for exhibitions, trade fairs and seasonal stalls.",
      "Must deposit advance tax based on estimated liability; valid up to 90 days.",
    ],
    docs: GENERAL_DOCS,
  },
  {
    key: "nrtp",
    title: "Non-Resident Taxable Person (NRTP)",
    short: "NRTP",
    form: "REG-09",
    tags: ["Foreign", "Advance tax"],
    blurb: "For persons based outside India making taxable supplies in India.",
    about:
      "A non-resident taxable person resides outside India but occasionally supplies goods or services in India without a fixed place of business here.\n\nRegistration is made on Form GST REG-09 at least five days before commencing business, along with an advance deposit of the estimated tax liability for the registration period.",
    who: [
      "A person residing outside India who occasionally supplies goods / services in India.",
      "Has no fixed place of business in India.",
      "Registers via Form REG-09 with an advance tax deposit.",
    ],
    docs: GENERAL_DOCS,
  },
  {
    key: "isd",
    title: "Input Service Distributor (ISD)",
    short: "ISD",
    form: "REG-01",
    tags: ["Credit distribution"],
    blurb: "Distribute input-service tax credit across branches under the same PAN.",
    about:
      "An Input Service Distributor is an office of a business that receives tax invoices for input services and distributes the eligible input tax credit to its branch units having the same PAN.\n\nISD registration is separate from the normal GST registration and is used purely to allocate common input-service credit across locations.",
    who: [
      "An office of a supplier that receives tax invoices for input services.",
      "Distributes the eligible input tax credit to its branches having the same PAN.",
      "Requires a separate ISD registration in addition to the normal GSTIN.",
    ],
    docs: GENERAL_DOCS,
  },
  {
    key: "tds",
    title: "Tax Deductor at Source (TDS)",
    short: "TDS",
    form: "REG-07",
    tags: ["Deductor", "TAN"],
    blurb: "For notified persons required to deduct TDS on payments to suppliers.",
    about:
      "Certain notified persons must register as a GST deductor. Government departments, local authorities and specified agencies deduct tax at source on payments made to suppliers and register on Form GST REG-07.\n\nThis registration is separate from a supplier's regular GSTIN and is keyed to the deductor's TAN.",
    who: [
      "Government departments, local authorities and notified persons required to deduct TDS under GST.",
      "Registers via Form REG-07 using the deductor's TAN.",
      "Requires details of the Drawing and Disbursing Officer where applicable.",
    ],
    docs: GENERAL_DOCS,
  },
  {
    key: "tcs",
    title: "Tax Collector at Source (TCS)",
    short: "TCS",
    form: "REG-07",
    tags: ["Collector", "Mandatory"],
    blurb: "For e-commerce operators required to collect TCS on supplies made through them.",
    about:
      "An e-commerce operator that facilitates the supply of goods or services between other parties must register as a tax collector and collect Tax Collected at Source on the net value of taxable supplies made through the platform.\n\nRegistration is mandatory irrespective of turnover and is made on Form GST REG-07.",
    who: [
      "E-commerce operators facilitating supplies between sellers and buyers.",
      "Registration is mandatory regardless of turnover.",
      "Required to collect TCS on the net value of taxable supplies through the platform.",
    ],
    docs: GENERAL_DOCS,
  },
  {
    key: "other",
    title: "Other Registrations",
    short: "Other",
    form: "REG-01 · REG-13",
    tags: ["OIDAR", "SEZ", "UIN"],
    blurb: "Non-resident online services providers, SEZ developers / units and UIN holders.",
    covers: [
      "Non-Resident Online Services Provider",
      "SEZ Developer / SEZ Unit",
      "UN Bodies / Embassies / Other Notified Persons (UIN)",
    ],
    about:
      "Three registrations that fall outside the standard categories are handled together here, because they ask for the same set of documents:\n\n• Non-Resident Online Services Provider — an OIDAR supplier providing online information and database access or retrieval services into India from outside the country.\n• SEZ Developer / SEZ Unit — a developer or a unit in a Special Economic Zone, which registers separately from any other place of business in the same state.\n• UN Bodies, Embassies and Other Notified Persons — who obtain a Unique Identity Number (UIN) to claim refund of the tax paid on their inward supplies.\n\nYour Cloudcrest BM advisor confirms which of the three applies and files on the correct form.",
    who: [
      "Non-resident online services (OIDAR) providers supplying into India from outside the country.",
      "SEZ developers and SEZ units.",
      "UN bodies, embassies, consulates and other notified persons applying for a Unique Identity Number (UIN).",
    ],
    docs: GENERAL_DOCS,
  },
];

/* -------------------------------------------------------------------------- */

/**
 * GST module entry point — the taxpayer-type picker first, leading to the
 * service page for that exact type, with "Start Application" opening the
 * stepper.
 */
export function GstWizard({ initialName, slug }: { initialName?: string; slug?: string }) {
  const fromSlug = slug && slug.startsWith("gst-") ? slug.slice(4) : undefined;
  const initialKey = GST_TYPES.some((t) => t.key === fromSlug) ? fromSlug : undefined;
  const [selectedKey, setSelectedKey] = useState<string | undefined>(initialKey);
  const [applying, setApplying] = useState(false);

  const selected = GST_TYPES.find((t) => t.key === selectedKey);

  if (applying && selected) {
    return (
      <GstStepper type={selected} initialName={initialName} onExit={() => setApplying(false)} />
    );
  }

  return (
    <TypePickerPage
      catalogSlug="gst"
      titlePrefix="GST Registration — "
      formDataKey="gstType"
      backLabel="Change type"
      initialKey={selectedKey}
      onSelectKey={(k) => setSelectedKey(k ?? undefined)}
      onStartApplication={(k) => {
        setSelectedKey(k);
        setApplying(true);
      }}
      hero={{
        badge: "GSTN · CBIC · GST Registration Desk",
        title: "GST Registration Services",
        subtitle:
          "Pick the type of GST registration you need. Each opens a full guide — who can apply, the documents you'll need and the fee — before you apply.",
        highlights: HIGHLIGHTS,
      }}
      picker={{
        eyebrow: "Types of GST registration",
        heading: "Choose a registration type",
        subtitle:
          "Select a category to see who can apply, the documents required and to start your application.",
      }}
      types={GST_TYPES}
    />
  );
}

function GstStepper({
  type,
  initialName = "",
  onExit,
}: {
  type: RegistrationType;
  initialName?: string;
  onExit: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Step 1 — Business & Contact (the document's page 2).
  const [businessName, setBusinessName] = useState(initialName);
  const [state, setState] = useState("");
  const [constitution, setConstitution] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [businessDetails, setBusinessDetails] = useState("");

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

  const typeSlug = `gst-${type.key}`;
  const { service, loading: catalogLoading } = useCatalogService([typeSlug, "gst"]);

  const feeContext: GstFeeContext = { kind: "gst", slug: typeSlug, state, constitution };
  const fees = useFeeEstimate(feeContext, !!user);
  const professionalFee = (() => {
    const line = fees.lines.find((l) => /professional/i.test(l.label))?.amount;
    return line && line > 0 ? line : null;
  })();

  // The document's page 3 — the checklist for this constitution and type. It is
  // both what the checklist step shows and what the applicant uploads against.
  const { base: baseDocs, extra: extraDocs } = checklistFor(constitution, type.key);
  const documents = [...baseDocs, ...extraDocs];

  const title = `GST Registration — ${type.title}`;
  const authority = service?.authority && service.authority !== "—" ? service.authority : "GSTN";
  const form = service?.form && service.form !== "—" ? service.form : type.form;
  const stepKey = STEPS[step]?.key;

  const answers = useMemo(() => {
    const rows: { key: string; label: string; value: string }[] = [];
    const add = (key: string, label: string, value: string) => {
      if (value.trim()) rows.push({ key, label, value: value.trim() });
    };
    add("gstType", "Type of GST Registration", type.title);
    add("businessName", "Business Name", businessName);
    add("state", "State / UT of Registration", state);
    add("constitution", "Constitution of Business", constitution);
    add("contactName", "Contact Person Name", contactName);
    add("contactEmail", "Contact Person Email", email);
    add("contactPhone", "Contact Person Mobile", mobile);
    add("businessDetails", "Business Details", businessDetails);
    return rows;
  }, [type.title, businessName, state, constitution, contactName, email, mobile, businessDetails]);

  const validateStep = (key: string | undefined): boolean => {
    const e: Record<string, string> = {};
    let first: string | null = null;
    const fail = (field: string, msg: string) => {
      e[field] = msg;
      if (!first) first = msg;
    };

    if (key === "business") {
      if (!businessName.trim()) fail("businessName", "Business name is required.");
      if (!state) fail("state", "Please select the State / UT of registration.");
      if (!constitution) fail("constitution", "Please select the constitution of business.");
      if (!contactName.trim()) fail("contactName", "Contact person name is required.");
      if (!EMAIL_RE.test(email.trim()))
        fail("email", "Enter a valid email address — the GST portal's OTPs are sent here.");
      if (!IN_MOBILE_RE.test(mobile.trim()))
        fail(
          "mobile",
          "Enter a valid 10-digit mobile number — the GST portal's OTPs are sent here.",
        );
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
        form,
        name1: businessName,
        state,
        fees: fees.lines,
        total: fees.total,
        ...formData,
      },
      `GST_Summary_${(businessName || "Application").trim().replace(/\s+/g, "_")}.pdf`,
    );

  return (
    <div>
      <WizardHero title="GST Registration" highlights={HIGHLIGHTS} />

      <div className="flex">
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-6 md:px-10 py-8 animate-in-up">
            <button
              onClick={onExit}
              className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <ArrowLeft className="size-3.5" /> Back to service details
            </button>

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">GST Registration · {authority}</div>
              <h2 className="text-2xl font-semibold tracking-tight">{type.title}</h2>
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
              {stepKey === "business" && (
                <Section
                  title="Business, State & Contact Details"
                  desc="Where the business registers and who the department should contact. GST is registered State-wise, so a separate registration is needed for each State you operate from."
                >
                  <Field label="Business Name *" error={errors.businessName}>
                    <Input
                      value={businessName}
                      onChange={setBusinessName}
                      placeholder="e.g. Sunrise Textiles"
                      error={errors.businessName}
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="State / UT *"
                      error={errors.state}
                      hint="Registration is State-specific."
                    >
                      <Select value={state} onChange={setState} error={errors.state}>
                        <option value="">-- Select State / UT --</option>
                        {INDIAN_STATES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Constitution of Business *" error={errors.constitution}>
                      <Select
                        value={constitution}
                        onChange={setConstitution}
                        error={errors.constitution}
                      >
                        <option value="">-- Select --</option>
                        {CONSTITUTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div className="rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
                    <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
                    <div className="text-[11px] text-foreground/70 leading-relaxed">
                      The constitution of business decides your document checklist on the next step.
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

                  <div className="pt-2 border-t border-border">
                    <Field
                      label="Business Details *"
                      error={errors.businessDetails}
                      hint="Nature of the business, the goods or services supplied and the place of business."
                    >
                      <TextArea
                        value={businessDetails}
                        onChange={setBusinessDetails}
                        rows={5}
                        placeholder="e.g. Retail trading of textiles and readymade garments from a rented showroom at Banjara Hills, Hyderabad. Operating since April 2023."
                        error={errors.businessDetails}
                      />
                    </Field>
                  </div>
                </Section>
              )}

              {stepKey === "documents" && (
                <Section
                  title="Document Checklist"
                  desc={`The documents a ${constitution || "business"} needs for a ${type.title} registration. Keep them ready — you'll upload them when you submit.`}
                >
                  <DocumentChecklist
                    heading={constitution || "Documents required"}
                    items={baseDocs}
                  />
                  {extraDocs.length > 0 && (
                    <DocumentChecklist
                      heading={`Additional documents for ${type.title}`}
                      items={extraDocs}
                    />
                  )}
                  {documents.length === 0 && (
                    <div className="text-[13px] text-muted-foreground">
                      Pick a constitution of business on the previous step to see the checklist.
                    </div>
                  )}
                </Section>
              )}

              {stepKey === "fees" && (
                <FeesStep
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                  loading={catalogLoading || fees.loading}
                  lines={fees.lines}
                  total={fees.total}
                  heading="Estimated GST Registration Fee Breakdown"
                  unpricedNote="Pricing for this registration type isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
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
                          a.key === "constitution" || a.key === "businessDetails"
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
                  {documents.length > 0 && (
                    <div className="pt-3 border-t border-border">
                      <dt className="text-muted-foreground text-xs">Documents to upload</dt>
                      <dd className="text-xs font-semibold text-foreground mt-0.5">
                        {documents.length} document{documents.length === 1 ? "" : "s"}
                      </dd>
                    </div>
                  )}
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
            { label: "Service", value: "GST Registration" },
            { label: "Type", value: type.title },
            { label: "State / UT", value: state },
            { label: "Business", value: businessName },
            { label: "Constitution", value: constitution },
          ]}
          professionalFee={professionalFee}
          gstPercent={service?.gstPercent || 18}
          formNo={form}
        />
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug={typeSlug}
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
        reason="Sign in to continue your GST registration — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/gst"
      />
    </div>
  );
}

/** One labelled group of the dynamic checklist. */
function DocumentChecklist({ heading, items }: { heading: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="size-3.5 text-primary shrink-0" />
        <div className="text-xs font-semibold text-foreground">{heading}</div>
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
  );
}
