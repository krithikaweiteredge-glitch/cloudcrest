import { useMemo, useState, useEffect } from "react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { useAuth } from "@/hooks/use-auth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SignInDialog } from "@/components/sign-in-dialog";
import {
  useCatalogService,
  useCatalogFamily,
  resolveDocuments,
  type ResolvedFees,
} from "@/lib/service-catalog";
import {
  resolveWizardRules,
  resolveEffectiveRules,
  isClassable,
  CLASSABLE_TYPES,
  hasLiabilityChoice,
  LIABILITY_LABEL,
  type EntityClass,
  type Liability,
} from "@/lib/company-types";
import { useFeeEstimate, type FeeContext } from "@/lib/fees-api";
import { INDIAN_STATES, INDUSTRY_TYPES } from "@/lib/form-options";
import {
  AlertTriangle, Download, ArrowLeft, ArrowRight, CheckCircle2,
  Circle, FileText, Info, ShieldCheck, Zap, ClipboardList, FileDown, Send, Lock,
  PenLine, Phone, MessageCircle, X, Loader2,
} from "lucide-react";

// Cloudcrest advisor contact — one place so the call / WhatsApp links stay in sync.
const ADVISOR_PHONE_DISPLAY = "+91 89770 79433";
const ADVISOR_TEL = "tel:+918977079433";
const ADVISOR_WHATSAPP = "https://wa.me/918977079433";

const STEPS = [
  { key: "type", label: "Type" },
  { key: "name", label: "Name" },
  { key: "details", label: "Details" },
  { key: "office", label: "Office" },
  { key: "capital", label: "Capital" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

type EntityType = {
  key: string;
  title: string;
  form: string;
  suffix: string;
  tags: string[];
  pop: boolean;
  minDirectors: number;
  minShareholders: number;
  requiresNominee: boolean;
  /** Admin-set professional fee; undefined when the type is unpriced. */
  professionalFee?: number;
};

// The catalog (`company-*` rows) is the source of truth for which entity types
// appear, their titles/forms and — via each row's `wizardRules` — their legal
// suffix and incorporation rules (see lib/company-types). There is deliberately
// no static fallback list: the entity picker is only meaningful when the backend
// is reachable (you can't submit a registration without it), so when the catalog
// can't be loaded the wizard shows an "unavailable" state instead of a picker.

/** `company-pvt` -> `pvt`; the wizard keys everything off this short entity key. */
const entityKeyFromSlug = (slug: string) => slug.replace(/^company-/, "");

/** Build a full picker entry, layering saved catalog rules over the built-in defaults. */
function buildEntityType(
  key: string,
  title: string,
  form: string,
  rawRules?: string | null,
  professionalFee?: number | null,
): EntityType {
  const r = resolveWizardRules(key, rawRules);
  return {
    key,
    title: title || key,
    form: form || "",
    suffix: r.suffix,
    tags: r.tags,
    pop: r.popular,
    minDirectors: r.minDirectors,
    minShareholders: r.minShareholders,
    requiresNominee: r.requiresNominee,
    professionalFee: typeof professionalFee === "number" ? professionalFee : undefined,
  };
}

const DEFAULT_ENTITY = buildEntityType("pvt", "Private Limited Company", "INC-32");

// Fallback checklist when the admin hasn't configured document types.
const FALLBACK_DOCS = [
  "PAN & Aadhaar of all directors",
  "Passport-size photographs",
  "Address proof (utility bill < 2 mo)",
  "Registered office proof",
  "Rent agreement + NOC (if rented)",
  "Digital Signature Certificate (DSC)",
  "MoA & AoA drafts",
];

// Registration certificates provided upon company incorporation displayed in sidebar.
const COMPANY_CERTIFICATES = [
  "Certificate of Incorporation",
  "MOA",
  "AOA",
  "PAN",
  "TAN",
  "DIN",
  "GST Certificate",
  "EPFO",
  "ESIC",
  "DSC",
  "Share Certificate",
];

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Real Validations" },
  { icon: Zap, label: "Dynamic Fee Estimate" },
  { icon: ClipboardList, label: "Registration Certificates" },
  { icon: FileDown, label: "Downloadable Summary" },
];

function format10DigitPhone(phoneStr?: string | null): string {
  if (!phoneStr) return "";
  let cleaned = phoneStr.trim();
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("91") && cleaned.length > 10) {
    cleaned = cleaned.slice(2);
  }
  cleaned = cleaned.replace(/\D/g, "");
  if (cleaned.length > 10) {
    cleaned = cleaned.slice(-10);
  }
  return cleaned;
}

function useMcaNameCheck(rawName: string, suffix: string) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const trimmed = rawName.trim();
    if (!trimmed) {
      setResult(null);
      setChecking(false);
      return;
    }

    if (trimmed.length < 3) {
      setResult({ ok: false, msg: "Minimum 3 characters required." });
      setChecking(false);
      return;
    }

    if (/(India|National|Bharat|President|Bank|Reserve|Insurance|Govt)/i.test(trimmed)) {
      setResult({ ok: false, msg: "Contains restricted keyword — needs Central Govt approval." });
      setChecking(false);
      return;
    }

    const fullName = suffix ? `${trimmed} ${suffix}` : trimmed;
    const ctrl = new AbortController();
    setChecking(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/mca/name-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fullName }),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          setResult({ ok: true, msg: "Preliminary check passed — reserve the name via RUN / Part A." });
          return;
        }

        const data = await res.json();
        if (data.available) {
          setResult({ ok: true, msg: `“${fullName}” appears to be available on the MCA registry.` });
        } else {
          setResult({
            ok: false,
            msg: data.reason || `“${fullName}” is already registered or restricted on MCA.`,
          });
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setResult({ ok: true, msg: "Preliminary check passed — reserve the name via RUN / Part A." });
        }
      } finally {
        setChecking(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [rawName, suffix]);

  return { checking, result };
}

export function CompanyWizard({ initialName }: { initialName?: string }) {
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [entity, setEntity] = useState("pvt");
  // Some entity types offer a choice of legal suffix (e.g. Section 8 →
  // "Foundation / Trust / Association"). This holds the one the user picked.
  const [suffixChoice, setSuffixChoice] = useState("");
  // Private vs Public form for the classable types (Section 8, Unlimited, Nidhi).
  const [entityClass, setEntityClass] = useState<EntityClass>("private");
  // Limited by Shares vs Limited by Guarantee for pvt / public / sec8. A
  // guarantee company has no share capital — the wizard asks for a member count
  // instead, and the backend prices it off that (see lib/company-types).
  const [liability, setLiability] = useState<Liability>("shares");
  const [members, setMembers] = useState(2);
  const [name1, setName1] = useState(initialName || "");
  const [name2, setName2] = useState("");
  const [state, setState] = useState("Telangana");
  const [directors, setDirectors] = useState(2);
  const [shareholders, setShareholders] = useState(2);
  const [capital, setCapital] = useState(100000);
  const [paidCapital, setPaidCapital] = useState(100000);
  const [objects, setObjects] = useState("");
  const [industryType, setIndustryType] = useState("");
  const [industryOther, setIndustryOther] = useState("");
  // The industry filed with the application — the free-text value when "Other".
  const effectiveIndustry = industryType === "Other" ? industryOther.trim() : industryType;
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [nominee, setNominee] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [applicantPhone, setApplicantPhone] = useState("");
  // Whether every director also holds shares. When "yes", the wizard collects the
  // directors' existing DINs (blank rows allowed — new DINs apply via SPICe+).
  const [sameDirShar, setSameDirShar] = useState(true);
  const [additionalShareholders, setAdditionalShareholders] = useState<number>(1);
  const [dins, setDins] = useState<{ din: string; name: string }[]>([{ din: "", name: "" }]);

  useEffect(() => {
    if (!user) return;
    setApplicantEmail((prev) => prev || user.email || "");
    setApplicantPhone((prev) => prev || format10DigitPhone(user.phone));

    fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/profiles/me`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setApplicantEmail((prev) => prev || data.user.email || user.email || "");
          setApplicantPhone((prev) => prev || format10DigitPhone(data.user.phone || user.phone));
        }
      })
      .catch((err) => console.error("Error prefilling wizard profile:", err));
  }, [user]);

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);
  // "How would you like to proceed?" popup, opened when a type card is clicked.
  const [proceedOpen, setProceedOpen] = useState(false);

  // Entity-type picker, driven by the catalog. Each `company-*` sibling becomes
  // a card; its title and form come from the catalog, while the legal suffix and
  // incorporation rules come from its saved wizardRules layered over the built-in
  // defaults (resolveWizardRules). Falls back to FALLBACK_TYPES when the family
  // endpoint returns nothing.
  const { variants: companyVariants, loading: familyLoading } = useCatalogFamily("company");
  const entityTypes = useMemo<EntityType[]>(() => {
    // `undefined` while the family query is loading, `[]` if the catalog is
    // unreachable or has no company variants. In both cases there's nothing to
    // pick — the render below shows a loading skeleton or an "unavailable" state
    // rather than any static fallback.
    if (!companyVariants) return [];
    return companyVariants.map((v) =>
      buildEntityType(entityKeyFromSlug(v.slug), v.name, v.formNo ?? "", v.wizardRules, v.professionalFee),
    );
  }, [companyVariants]);

  // If the catalog dropped the currently selected type (admin deleted/renamed a
  // variant), fall back to the first available so `selected` is never missing.
  useEffect(() => {
    if (!entityTypes.some((e) => e.key === entity)) {
      setEntity(entityTypes[0]?.key ?? "pvt");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityTypes]);

  const selected = entityTypes.find((e) => e.key === entity) ?? entityTypes[0] ?? DEFAULT_ENTITY;

  // Whether this type offers a Private/Public choice, and the resulting minimums
  // + (for Unlimited) the class-driven suffix.
  const classable = isClassable(entity);
  const eff = resolveEffectiveRules(entity, classable ? entityClass : null, {
    minDirectors: selected.minDirectors,
    minShareholders: selected.minShareholders,
  });

  // Whether this type offers the Limited by Shares / Limited by Guarantee choice
  // (Private, Public and Section 8), and whether the guarantee form is active —
  // a guarantee company has no share capital, so the wizard asks for a member
  // count and skips the capital step's share-capital inputs.
  const liabilityChoice = hasLiabilityChoice(entity);
  const isGuarantee = liabilityChoice && liability === "guarantee";

  // A "/"-separated suffix means the entity permits several legal endings and
  // the applicant must pick exactly one (e.g. Foundation OR Trust OR
  // Association). A single suffix is used as-is. When the class dictates the
  // suffix (Unlimited: "Private Limited" vs "Limited") it wins outright.
  const baseSuffix = eff.suffixOverride ?? selected.suffix;
  const suffixOptions = baseSuffix
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const hasSuffixChoice = suffixOptions.length > 1;
  const effectiveSuffix =
    hasSuffixChoice && suffixChoice ? suffixChoice : hasSuffixChoice ? suffixOptions[0] : baseSuffix;

  // Reset the picked suffix, the private/public class and the liability form to
  // their defaults whenever the entity (and therefore its allowed suffixes /
  // classes / liability options) changes.
  useEffect(() => {
    setSuffixChoice(suffixOptions.length > 1 ? suffixOptions[0] : "");
    setEntityClass(CLASSABLE_TYPES[entity]?.default ?? "private");
    setLiability("shares");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  // Keep the director/shareholder/member counts pinned to the effective minimum
  // for the selected type + class (so switching type or Private/Public resets
  // them). Members mirror the shareholder minimum (2 private / 7 public).
  useEffect(() => {
    setDirectors(eff.minDirectors);
    setShareholders(eff.minShareholders);
    setMembers(eff.minShareholders);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, entityClass]);

  // Pricing & checklist come from the admin catalog. A per-entity row
  // (`company-pvt`) wins over the base `company` service when one exists.
  const { service, loading: catalogLoading } = useCatalogService([`company-${entity}`, "company"]);
  const { documents, fromCatalog: docsFromCatalog } = resolveDocuments(service, FALLBACK_DOCS);

  // Fees come from the backend fee engine (the single source of truth). We
  // describe the incorporation with a fee context; the backend returns the
  // itemised breakdown (professional + statutory + 18% GST) and recomputes it
  // authoritatively at submission from the same context.
  const feeContext: FeeContext = {
    kind: "company",
    entity,
    entityClass: classable ? entityClass : null,
    liability: liabilityChoice ? liability : null,
    // A guarantee company has no share capital: send nil capital + the member
    // count so the backend uses the members-based (Table I(II)) fee path.
    capital: isGuarantee ? 0 : capital,
    paidCapital: isGuarantee ? 0 : paidCapital,
    members: isGuarantee ? members : undefined,
    directors,
    state,
  };
  const estimate = useFeeEstimate(feeContext, !!user);
  const fees: ResolvedFees = {
    lines: estimate.lines,
    total: estimate.total,
    fromCatalog: estimate.fromCatalog,
  };
  const total = estimate.total;

  // The proposed names are stored with the entity suffix appended, so the record
  // holds the full company name (e.g. "ACME TECH SOLUTIONS Private Limited").
  const withSuffix = (n: string) => {
    const t = n.trim();
    return t ? `${t} ${effectiveSuffix}` : "";
  };

  const { checking: checkingName1, result: name1Check } = useMcaNameCheck(name1, effectiveSuffix);
  const { checking: checkingName2, result: name2Check } = useMcaNameCheck(name2, effectiveSuffix);

  const capitalCategory =
    capital <= 100000 ? "Small" : capital <= 1000000 ? "Standard" : capital <= 10000000 ? "Growth" : "Large";

  // The visible steps are keyed, not positional, so we can insert an extra
  // "Structure" step (Private/Public + Limited by Shares/Guarantee) after Type
  // for the entity types that offer that choice — the applicant reaches it by
  // pressing Next from the type picker. A guarantee company has no share
  // capital, so the "Capital" step is relabelled to "Members".
  const steps = useMemo(() => {
    const base = liabilityChoice
      ? [STEPS[0], { key: "structure", label: "Structure" }, ...STEPS.slice(1)]
      : STEPS;
    return base.map((s) => (s.key === "capital" && isGuarantee ? { ...s, label: "Members" } : s));
  }, [liabilityChoice, isGuarantee]);

  const stepKey = steps[step]?.key ?? "type";

  // A name passed in from the homepage search only pre-fills the Name field
  // (name1, above) — the wizard still opens on the Type step so the applicant
  // chooses the company type first.

  const validateStep = (currentStep: number): boolean => {
    const key = steps[currentStep]?.key ?? "type";
    const newErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    if (key === "name") {
      if (!name1.trim()) {
        newErrors.name1 = "Please enter Proposed Name 1.";
        globalMsg = "Proposed Name 1 is required.";
      } else if (name1Check && !name1Check.ok) {
        newErrors.name1 = name1Check.msg;
        globalMsg = name1Check.msg;
      } else if (/(India|National|Bharat|President|Bank)/i.test(name1)) {
        newErrors.name1 = "Contains restricted keyword requiring Central Govt approval.";
        globalMsg = "Proposed Name 1 contains restricted keywords.";
      }

      if (!objects.trim()) {
        newErrors.objects = "Please describe the main object / nature of business.";
        if (!globalMsg) globalMsg = "Main object of business is required.";
      } else if (objects.trim().length < 10) {
        newErrors.objects = "Main objects should be at least 10 characters long.";
        if (!globalMsg) globalMsg = "Please provide a more detailed main object description.";
      }
    } else if (key === "details") {
      // Minimums come from the effective rules (catalog rules layered with the
      // Private/Public class and any fixed statutory override).
      const minDir = eff.minDirectors;
      const minShr = eff.minShareholders;

      if (directors < minDir) {
        newErrors.directors = `${selected.title} requires a minimum of ${minDir} director(s).`;
        globalMsg = `Minimum required: ${minDir} director(s).`;
      }

      // A company limited by guarantee has members, not shareholders — the member
      // count is collected on the Capital step, so skip the shareholder check.
      if (!isGuarantee && shareholders < minShr) {
        newErrors.shareholders = `${selected.title} requires a minimum of ${minShr} shareholder(s).`;
        if (!globalMsg) globalMsg = `Minimum required: ${minShr} shareholder(s).`;
      }

      if (selected.requiresNominee && !nominee.trim()) {
        newErrors.nominee = `Nominee name is mandatory for ${selected.title}.`;
        if (!globalMsg) globalMsg = "Nominee name is required.";
      }

      if (!sameDirShar && (!additionalShareholders || additionalShareholders < 1)) {
        newErrors.additionalShareholders = "Please specify at least 1 additional shareholder (non-director).";
        if (!globalMsg) globalMsg = "Additional shareholders must be at least 1.";
      }

      if (applicantEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail.trim())) {
        newErrors.applicantEmail = "Invalid email address format.";
        if (!globalMsg) globalMsg = "Please enter a valid applicant email.";
      }

      if (applicantPhone.trim()) {
        const cleanPhone = format10DigitPhone(applicantPhone);
        if (!cleanPhone || cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
          newErrors.applicantPhone = "Invalid 10-digit mobile number.";
          if (!globalMsg) globalMsg = "Please enter a valid 10-digit phone number.";
        }
      }
    } else if (key === "office") {
      if (!address.trim()) {
        newErrors.address = "Please enter the full registered office address.";
        globalMsg = "Registered office address is required.";
      } else if (address.trim().length < 10) {
        newErrors.address = "Address should be at least 10 characters long.";
        globalMsg = "Registered office address is too short.";
      }

      if (!state.trim()) {
        newErrors.state = "Please select a state.";
        if (!globalMsg) globalMsg = "State is required.";
      }

      if (!city.trim()) {
        newErrors.city = "Please enter city / district.";
        if (!globalMsg) globalMsg = "City is required.";
      }

      if (!pincode.trim()) {
        newErrors.pincode = "Please enter a 6-digit PIN Code.";
        if (!globalMsg) globalMsg = "PIN Code is required.";
      } else if (!/^[1-9][0-9]{5}$/.test(pincode.trim())) {
        newErrors.pincode = "Must be a valid 6-digit Indian PIN Code (e.g. 400001).";
        if (!globalMsg) globalMsg = "Invalid 6-digit PIN Code.";
      }
    } else if (key === "capital") {
      if (isGuarantee) {
        // Limited by guarantee: no share capital — validate the member count
        // against the statutory minimum (2 private / 7 public) instead.
        const minMem = eff.minShareholders;
        if (!members || members < minMem) {
          newErrors.members = `${selected.title} requires a minimum of ${minMem} member(s).`;
          globalMsg = `Minimum required: ${minMem} member(s).`;
        }
      } else {
        if (!capital || capital < 10000) {
          newErrors.capital = "Authorised capital must be at least ₹10,000.";
          globalMsg = "Authorised capital must be at least ₹10,000.";
        }

        if (!paidCapital || paidCapital < 10000) {
          newErrors.paidCapital = "Paid-up capital must be at least ₹10,000.";
          if (!globalMsg) globalMsg = "Paid-up capital must be at least ₹10,000.";
        } else if (paidCapital > capital) {
          newErrors.paidCapital = "Paid-up capital cannot exceed Authorised Capital.";
          if (!globalMsg) globalMsg = "Paid-up capital cannot exceed Authorised Capital.";
        }
      }
    }

    setErrors(newErrors);
    setStepError(globalMsg);
    return Object.keys(newErrors).length === 0 && !globalMsg;
  };

  const next = () => {
    // Advancing past the first step requires an account — the wizard collects
    // filing details and shows pricing, both of which are for signed-in users.
    if (!user) {
      setOpenSignIn(true);
      return;
    }
    if (validateStep(step)) {
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

  const handleStepChange = (targetStep: number) => {
    if (targetStep > step && !user) {
      setOpenSignIn(true);
      return;
    }
    if (targetStep < step) {
      setStep(targetStep);
      setStepError(null);
      setErrors({});
    } else {
      if (validateStep(step)) {
        setStep(targetStep);
        setStepError(null);
        setErrors({});
      }
    }
  };

  const downloadSummaryPdf = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/summary/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selected.title,
          name1,
          name2,
          suffix: effectiveSuffix,
          form: selected.form,
          directors,
          ...(liabilityChoice ? { liability: isGuarantee ? LIABILITY_LABEL.guarantee : LIABILITY_LABEL.shares } : {}),
          ...(isGuarantee ? { members } : { shareholders, capital }),
          objects,
          address,
          city,
          state,
          pincode,
          // Catalog-driven line items; the PDF renders whatever labels it gets.
          fees: fees.lines,
          total,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate PDF summary");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const fileName = `Filing_Summary_${name1 ? name1.trim().replace(/\s+/g, "_") : "Company"}.pdf`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      alert(err.message || "Failed to download PDF summary");
    }
  };

  return (
    <div>
      {/* Hero band */}
      <section className="relative overflow-hidden gradient-hero text-white">
        <div className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, oklch(0.7 0.19 45 / 0.4), transparent 40%), radial-gradient(circle at 80% 80%, oklch(0.6 0.18 240 / 0.5), transparent 45%)",
          }}
        />
        {/* Panning technical grid — the same mesh the home hero uses. */}
        <div className="hero-grid" />
        <div className="relative px-10 py-10 max-w-5xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[11px] mono uppercase tracking-widest text-white/90">
            <span className="size-1.5 rounded-full bg-primary live-dot" />
            MCA · Tax · Labour · Municipal · IP Registration Desk
          </span>
          <h1 className="mt-4 text-4xl md:text-[42px] font-semibold font-display tracking-tight leading-[1.05]">
            Business Registration <br />
            {/* <span className="text-primary">Compliance Wizard</span> */}
          </h1>
          <p className="mt-3 text-white/70 max-w-2xl text-[15px] leading-relaxed">
            A guided Cloudcrest BM workspace for Company, LLP, tax registrations,
            labour law, municipal licences, industry licences and intellectual
            property filings.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {HIGHLIGHTS.map((h) => (
              <span
                key={h.label}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/12 border border-white/15 text-[12px] text-white/90 hover:bg-white/20 transition-colors"
              >
                <h.icon className="size-3.5 text-primary" />
                {h.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="flex">
        {/* Center */}
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-10 py-8 animate-in-up">
            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">
                Company Registration · MCA
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Company Incorporation Wizard
              </h2>
              
            </div>

            <div className="rounded-xl border border-border bg-surface shadow-card p-4">
              <Stepper steps={steps} current={step} onGo={handleStepChange} />
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
                <span className="font-semibold text-foreground">Minimum rules · </span>
                {selected.title}
                {classable ? ` (${entityClass === "public" ? "Public" : "Private"})` : ""} — minimum{" "}
                {eff.minDirectors} director{eff.minDirectors === 1 ? "" : "s"} / {eff.minShareholders}{" "}
                {eff.minShareholders === 1 ? "member" : "members"}
                {selected.requiresNominee ? " + nominee" : ""}.
              </div>
            </div>

            <div key={step} className="mt-8 animate-in-up">
              {stepKey === "type" && familyLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={`skeleton-${i}`}
                      className="h-[104px] rounded-xl border border-border bg-muted/40 animate-pulse"
                    />
                  ))}
                </div>
              )}

              {/* Catalog loaded but no entity types available (backend unreachable
                  or none configured). Without it there's nothing to submit, so we
                  show an explicit unavailable state instead of a fallback picker. */}
              {stepKey === "type" && !familyLoading && entityTypes.length === 0 && (
                <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
                  <div className="size-11 rounded-full bg-destructive/10 text-destructive grid place-items-center mx-auto mb-3">
                    <ShieldCheck className="size-5" />
                  </div>
                  <h3 className="text-sm font-semibold">Registration is temporarily unavailable</h3>
                  <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">
                    We couldn't load the list of company types. Please refresh the page or try again
                    in a few minutes — our team has been notified.
                  </p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand"
                  >
                    Retry
                  </button>
                </div>
              )}

              {stepKey === "type" && !familyLoading && entityTypes.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {entityTypes.map((t) => {
                    const active = t.key === entity;
                    // Fee tag shown where the form number used to be: the admin's
                    // professional fee for this type, with a "+ GST" note. Revealed
                    // on card hover. Shown whenever the type is priced.
                    const hasFee = typeof t.professionalFee === "number" && t.professionalFee > 0;
                    const proFee = t.professionalFee ?? 0;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          // Director/shareholder counts are reset to the effective
                          // minimum by an effect keyed on entity + class.
                          setEntity(t.key);
                          setErrors({});
                          setStepError(null);
                        }}
                        className={
                          "group/card text-left p-4 rounded-xl bg-surface border transition-all hover-lift ring-focus " +
                          (active
                            ? "border-primary ring-2 ring-primary/25 shadow-card"
                            : "border-border hover:border-border-strong shadow-card")
                        }
                      >
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <span className="text-sm font-semibold leading-tight">
                            {t.title}
                          </span>
                          {hasFee && (
                            <span className="mono text-[10px] font-semibold text-foreground/80 whitespace-nowrap shrink-0 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100">
                              ₹{proFee.toLocaleString("en-IN")} + GST
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground mb-3">
                          Suffix: <span className="text-foreground/80">{t.suffix}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {t.pop && (
                            <span className="px-1.5 py-0.5 rounded-md bg-primary/12 text-primary text-[9px] mono uppercase tracking-wider">
                              Popular
                            </span>
                          )}
                          {t.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground text-[9px] mono uppercase tracking-wider"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Structure step — reached by pressing Next from the type picker.
                  It offers the Private/Public class (Section 8 only) and the
                  Limited by Shares / Limited by Guarantee choice for the types
                  that offer it (Private, Public, Section 8). The liability choice
                  decides whether the wizard later asks for a Share Capital or a
                  Number of Members. */}
              {stepKey === "structure" && (
                <Card>
                  <div className="space-y-6">
                    {classable && (
                      <div>
                        <div className="label-eyebrow mb-2.5">Company Class</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <OptionCard
                            active={entityClass === "private"}
                            onClick={() => setEntityClass("private")}
                            title="Private Limited"
                            subtitle="Minimum 2 members / 2 directors"
                          />
                          <OptionCard
                            active={entityClass === "public"}
                            onClick={() => setEntityClass("public")}
                            title="Public Limited"
                            subtitle="Minimum 7 members / 3 directors"
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="label-eyebrow">Liability</span>
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center size-4 rounded-full bg-muted/60 text-muted-foreground hover:text-primary hover:bg-muted transition-colors cursor-pointer"
                                aria-label="Liability Info"
                              >
                                <Info className="size-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs p-3 text-xs bg-slate-900 text-slate-100 shadow-xl border border-slate-700 z-50">
                              <p className="font-semibold mb-1 text-primary-foreground">Company Liability Types</p>
                              <p className="mb-2"><strong className="text-white">Limited by Shares:</strong> Shareholders are only liable up to the unpaid face value of their shares. Standard structure for commercial businesses.</p>
                              <p><strong className="text-white">Limited by Guarantee:</strong> Members guarantee a fixed amount to contribute if the company is wound up. Used for non-profits & associations without share capital.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <OptionCard
                          active={liability === "shares"}
                          onClick={() => setLiability("shares")}
                          title="Limited by Shares"
                          subtitle="You'll state a share capital"
                          tooltip="Limited by Shares: Members' liability is limited to the unpaid amount on shares held by them. Most common for commercial businesses."
                        />
                        <OptionCard
                          active={liability === "guarantee"}
                          onClick={() => setLiability("guarantee")}
                          title="Limited by Guarantee"
                          subtitle="No share capital — you'll state a number of members"
                          tooltip="Limited by Guarantee: Members guarantee a fixed amount to contribute toward assets if wound up. Common for non-profits, clubs & associations."
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {stepKey === "name" && (
                <Card>
                  <div className="space-y-6">
                    <Field label="Proposed Name 1 *" error={errors.name1}>
                      <div className="flex gap-2">
                        <Input
                          value={name1}
                          onChange={(v) => { setName1(v); setErrors((prev) => ({ ...prev, name1: "" })); }}
                          placeholder="e.g. ACME TECH SOLUTIONS"
                          error={errors.name1}
                        />
                        {classable && !liabilityChoice && (
                          <select
                            value={entityClass}
                            onChange={(e) => setEntityClass(e.target.value as EntityClass)}
                            title="Private or Public company"
                            className="mono self-stretch shrink-0 rounded-lg border border-border bg-input text-foreground text-xs px-2 cursor-pointer focus:outline-none focus:border-primary/60 transition-colors"
                          >
                            <option value="private">Private</option>
                            <option value="public">Public</option>
                          </select>
                        )}
                        {hasSuffixChoice ? (
                          <select
                            value={suffixChoice}
                            onChange={(e) => setSuffixChoice(e.target.value)}
                            title="Choose the legal suffix"
                            className="mono self-stretch shrink-0 rounded-lg border border-border bg-input text-foreground text-xs px-2 cursor-pointer focus:outline-none focus:border-primary/60 transition-colors"
                          >
                            {suffixOptions.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="mono text-xs text-muted-foreground self-center whitespace-nowrap">
                            {effectiveSuffix}
                          </span>
                        )}
                      </div>
                      {checkingName1 ? (
                        <div className="mt-2 text-[11px] text-primary flex items-center gap-1.5 font-medium">
                          <Loader2 className="size-3 animate-spin" /> Checking MCA registry availability…
                        </div>
                      ) : name1Check ? (
                        <div
                          className={
                            "mt-2 text-[11px] flex items-center gap-1.5 font-medium " +
                            (name1Check.ok ? "text-success" : "text-destructive")
                          }
                        >
                          {name1Check.ok ? (
                            <CheckCircle2 className="size-3.5 shrink-0" />
                          ) : (
                            <AlertTriangle className="size-3.5 shrink-0" />
                          )}
                          <span>{name1Check.msg}</span>
                        </div>
                      ) : null}
                    </Field>
                    <Field label="Proposed Name 2 (Alternate)">
                      <div className="flex gap-2">
                        <Input value={name2} onChange={setName2} placeholder="Optional alternate name" />
                        <span className="mono text-xs text-muted-foreground self-center whitespace-nowrap">
                          {effectiveSuffix}
                        </span>
                      </div>
                      {checkingName2 ? (
                        <div className="mt-2 text-[11px] text-primary flex items-center gap-1.5 font-medium">
                          <Loader2 className="size-3 animate-spin" /> Checking MCA registry availability…
                        </div>
                      ) : name2Check ? (
                        <div
                          className={
                            "mt-2 text-[11px] flex items-center gap-1.5 font-medium " +
                            (name2Check.ok ? "text-success" : "text-destructive")
                          }
                        >
                          {name2Check.ok ? (
                            <CheckCircle2 className="size-3.5 shrink-0" />
                          ) : (
                            <AlertTriangle className="size-3.5 shrink-0" />
                          )}
                          <span>{name2Check.msg}</span>
                        </div>
                      ) : null}
                    </Field>
                    <Field label="Industry Type">
                      <select
                        value={industryType}
                        onChange={(e) => setIndustryType(e.target.value)}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow"
                      >
                        <option value="">Select industry type…</option>
                        {INDUSTRY_TYPES.map((i) => (
                          <option key={i} value={i}>{i}</option>
                        ))}
                      </select>
                      {industryType === "Other" && (
                        <input
                          value={industryOther}
                          onChange={(e) => setIndustryOther(e.target.value)}
                          placeholder="Please specify your industry"
                          className="mt-2 w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow"
                        />
                      )}
                    </Field>
                    <Field label="Object / Industry *" error={errors.objects}>
                      <textarea
                        value={objects}
                        onChange={(e) => { setObjects(e.target.value); setErrors((prev) => ({ ...prev, objects: "" })); }}
                        rows={3}
                        placeholder="Main object of the company (e.g. software development, IT services, trading…)"
                        className={
                          "w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " +
                          (errors.objects ? "border-destructive focus:ring-destructive/25" : "border-border")
                        }
                      />
                    </Field>
                  </div>
                </Card>
              )}

              {stepKey === "details" && (
                <Card>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Number of Directors *" error={errors.directors}>
                      <NumberInput
                        value={directors}
                        onChange={(v) => { setDirectors(v); setErrors((prev) => ({ ...prev, directors: "" })); }}
                        min={1}
                        max={15}
                        error={errors.directors}
                      />
                    </Field>
                    {/* A guarantee company has members (collected on the Members
                        step), not shareholders. */}
                    {!isGuarantee && (
                      <Field label="Number of Shareholders *" error={errors.shareholders}>
                        <NumberInput
                          value={shareholders}
                          onChange={(v) => { setShareholders(v); setErrors((prev) => ({ ...prev, shareholders: "" })); }}
                          min={1}
                          max={200}
                          error={errors.shareholders}
                        />
                      </Field>
                    )}
                    {selected.requiresNominee && (
                      <Field label="Nominee Name *" error={errors.nominee}>
                        <Input
                          value={nominee}
                          onChange={(v) => { setNominee(v); setErrors((prev) => ({ ...prev, nominee: "" })); }}
                          placeholder="Nominee Full Name"
                          error={errors.nominee}
                        />
                      </Field>
                    )}
                    <Field label="Applicant Email" error={errors.applicantEmail}>
                      <Input
                        value={applicantEmail}
                        onChange={(v) => { setApplicantEmail(v); setErrors((prev) => ({ ...prev, applicantEmail: "" })); }}
                        placeholder="applicant@company.in"
                        error={errors.applicantEmail}
                      />
                    </Field>
                    <Field label="Applicant Mobile" error={errors.applicantPhone}>
                      <Input
                        value={applicantPhone}
                        onChange={(v) => {
                          const clean = format10DigitPhone(v);
                          setApplicantPhone(clean);
                          setErrors((prev) => ({ ...prev, applicantPhone: "" }));
                        }}
                        placeholder="9876543210"
                        error={errors.applicantPhone}
                      />
                    </Field>
                  </div>

                  {/* Are all Directors also Shareholders? */}
                  <div className="mt-5 flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-panel/40">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-foreground">Are all Directors also Shareholders?</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{sameDirShar ? "Yes" : "No"}</div>
                    </div>
                    <span className={"text-[11px] font-bold mono uppercase tracking-wider shrink-0 " + (sameDirShar ? "text-success" : "text-muted-foreground")}>
                      {sameDirShar ? "Yes" : "No"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={sameDirShar}
                      aria-label="Are all Directors also Shareholders"
                      onClick={() => setSameDirShar((v) => !v)}
                      className={
                        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 " +
                        (sameDirShar ? "bg-primary" : "bg-muted-foreground/30")
                      }
                    >
                      <span className={"inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200 " + (sameDirShar ? "translate-x-[1.375rem]" : "translate-x-0.5")} />
                    </button>
                  </div>

                  {!sameDirShar && (
                    <div className="mt-4">
                      <Field label="Additional Shareholders (non-directors)" error={errors.additionalShareholders}>
                        <NumberInput
                          value={additionalShareholders}
                          onChange={(v) => {
                            setAdditionalShareholders(v);
                            setErrors((prev) => ({ ...prev, additionalShareholders: "" }));
                          }}
                          min={1}
                          placeholder="e.g. 1"
                          error={errors.additionalShareholders}
                        />
                      </Field>
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="label-eyebrow mb-1.5 flex items-center gap-1.5">
                      Existing DINs
                      <span
                        title="Enter existing Director Identification Numbers. New directors can apply via SPICe+ during incorporation."
                        className="inline-grid place-items-center size-4 rounded-full bg-muted-foreground/20 text-[9px] font-bold text-muted-foreground cursor-help"
                      >
                        ?
                      </span>
                    </div>
                    <div className="space-y-2">
                      {dins.map((d, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            value={d.din}
                            maxLength={8}
                            onChange={(e) => setDins((a) => a.map((x, j) => (j === i ? { ...x, din: e.target.value } : x)))}
                            placeholder="DIN (8 digits)"
                            className="w-40 bg-input border border-border rounded-lg px-3 py-2.5 text-sm mono ring-focus"
                          />
                          <input
                            value={d.name}
                            onChange={(e) => setDins((a) => a.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                            placeholder="Director Name"
                            className="flex-1 bg-input border border-border rounded-lg px-3 py-2.5 text-sm ring-focus"
                          />
                          {i === dins.length - 1 ? (
                            <button type="button" onClick={() => setDins((a) => [...a, { din: "", name: "" }])} title="Add" className="shrink-0 size-[42px] grid place-items-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20">
                              <span className="text-lg leading-none">+</span>
                            </button>
                          ) : (
                            <button type="button" onClick={() => setDins((a) => a.filter((_, j) => j !== i))} title="Remove" className="shrink-0 size-[42px] grid place-items-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20">
                              <span className="text-lg leading-none">−</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">Leave blank if DIN not yet allotted.</p>
                  </div>
                </Card>
              )}

              {stepKey === "office" && (
                <Card>
                  <div className="space-y-4">
                    <Field label="Registered Office Address *" error={errors.address}>
                      <textarea
                        rows={3}
                        value={address}
                        onChange={(e) => { setAddress(e.target.value); setErrors((prev) => ({ ...prev, address: "" })); }}
                        placeholder="Building Name, Flat/Door No., Street, Locality"
                        className={
                          "w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " +
                          (errors.address ? "border-destructive focus:ring-destructive/25" : "border-border")
                        }
                      />
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Field label="State *" error={errors.state}>
                        <select
                          value={state}
                          onChange={(e) => { setState(e.target.value); setErrors((prev) => ({ ...prev, state: "" })); }}
                          className={
                            "w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " +
                            (errors.state ? "border-destructive focus:ring-destructive/25" : "border-border")
                          }
                        >
                          {INDIAN_STATES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="City / District *" error={errors.city}>
                        <Input
                          value={city}
                          onChange={(v) => { setCity(v); setErrors((prev) => ({ ...prev, city: "" })); }}
                          placeholder="Hyderabad"
                          error={errors.city}
                        />
                      </Field>
                      <Field label="PIN Code *" error={errors.pincode}>
                        <Input
                          value={pincode}
                          onChange={(v) => { setPincode(v); setErrors((prev) => ({ ...prev, pincode: "" })); }}
                          placeholder="400001"
                          error={errors.pincode}
                        />
                      </Field>
                    </div>
                  </div>
                </Card>
              )}

              {stepKey === "capital" && isGuarantee && (
                <Card>
                  <div className="space-y-6">
                    <div className="rounded-lg border border-accent/25 bg-accent/6 p-3.5 flex gap-2.5 text-xs text-foreground/80">
                      <Info className="size-4 text-accent shrink-0 mt-0.5" />
                      <span>
                        A company <span className="font-semibold text-foreground">limited by guarantee</span> has
                        no share capital. Instead, its members undertake to contribute a guaranteed amount if the
                        company is wound up. Tell us how many members it will have.
                      </span>
                    </div>
                    <Field label="Number of Members *" error={errors.members}>
                      <NumberInput
                        value={members}
                        onChange={(v) => { setMembers(v); setErrors((prev) => ({ ...prev, members: "" })); }}
                        min={eff.minShareholders}
                        max={200}
                        error={errors.members}
                      />
                      <div className="mt-1.5 text-[11px] text-muted-foreground">
                        Minimum {eff.minShareholders} member{eff.minShareholders === 1 ? "" : "s"} for a{" "}
                        {entityClass === "public" ? "public" : "private"} company.
                      </div>
                    </Field>
                  </div>
                </Card>
              )}

              {stepKey === "capital" && !isGuarantee && (
                <Card>
                  <div className="space-y-6">
                    <Field label="Authorised Capital (INR) *" error={errors.capital}>
                      <div className="flex items-center gap-3">
                        <NumberInput
                          value={capital}
                          onChange={(v) => { setCapital(v); setErrors((prev) => ({ ...prev, capital: "" })); }}
                          min={10000}
                          step={10000}
                          error={errors.capital}
                        />
                        <span className="px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20 text-[10px] mono uppercase tracking-wider text-primary">
                          {capitalCategory}
                        </span>
                      </div>
                    </Field>
                    <Field label="Paid-up Capital (INR) *" error={errors.paidCapital}>
                      <NumberInput
                        value={paidCapital}
                        onChange={(v) => { setPaidCapital(v); setErrors((prev) => ({ ...prev, paidCapital: "" })); }}
                        min={10000}
                        step={10000}
                        error={errors.paidCapital}
                      />
                      <div className="mt-1.5 text-[11px] text-muted-foreground">
                        Must be ≤ Authorised Capital.
                      </div>
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[100000, 1000000, 10000000].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setCapital(c);
                            if (paidCapital > c) setPaidCapital(c);
                            setErrors({});
                          }}
                          className={
                            "p-3 rounded-lg border text-left transition-all hover-lift " +
                            (capital === c
                              ? "border-primary bg-primary/5"
                              : "border-border bg-surface hover:border-border-strong")
                          }
                        >
                          <div className="label-eyebrow">Preset</div>
                          <div className="mono text-sm mt-1 font-semibold">
                            ₹ {c.toLocaleString("en-IN")}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {stepKey === "fees" && (
                <FeeBreakdown
                  fees={fees}
                  loading={estimate.loading}
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                />
              )}

              {stepKey === "summary" && (
                <SummaryPreview
                  selected={selected}
                  entityLabel={[
                    selected.title,
                    [
                      classable ? (entityClass === "public" ? "Public" : "Private") : null,
                      liabilityChoice ? LIABILITY_LABEL[liability] : null,
                    ].filter(Boolean).join(" · "),
                  ]
                    .filter(Boolean)
                    .join(" — ")}
                  suffix={effectiveSuffix}
                  name1={name1}
                  state={state}
                  directors={directors}
                  shareholders={shareholders}
                  capital={capital}
                  isGuarantee={isGuarantee}
                  members={members}
                  fees={fees}
                />
              )}
            </div>

            {/* Wizard actions */}
            <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
              <button
                onClick={back}
                disabled={step === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-all"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
              <div className="flex items-center gap-4">
                {step === steps.length - 1 ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={downloadSummaryPdf}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-muted transition-colors"
                    >
                      <Download className="size-4" /> Summary
                    </button>
                    <button
                      onClick={() => setOpenReg(true)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-shadow"
                    >
                      <Send className="size-4" /> Submit Application
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (stepKey === "type") {
                        setProceedOpen(true);
                      } else {
                        next();
                      }
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
                  >
                    Next · {steps[step + 1].label}
                    <ArrowRight className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right panel — checklist only */}
        <aside className="hidden lg:block w-80 border-l border-border bg-surface">
          <div className="sticky top-16 p-6">
            <div className="label-eyebrow mb-2.5 text-primary">Current Selection</div>
            <div className="rounded-lg border border-border bg-panel p-3.5 space-y-3">
              <div>
                <div className="text-[11px] text-muted-foreground font-medium">Entity Type</div>
                <div className="text-sm font-semibold text-foreground mt-0.5">{selected.title}</div>
              </div>

              {typeof selected.professionalFee === "number" && selected.professionalFee > 0 && (
                <div className="pt-2.5 border-t border-border/60">
                  <div className="text-[11px] text-muted-foreground font-medium">Professional Fee</div>
                  <div className="text-xs font-semibold mono text-primary mt-0.5">
                    ₹{selected.professionalFee.toLocaleString("en-IN")} + 18% GST
                  </div>
                </div>
              )}

              <div className="pt-2.5 border-t border-border/60 text-[10px] mono text-primary">
                Form · {selected.form}
              </div>
            </div>

            <div className="mt-7">
              <div className="label-eyebrow mb-3">
                Registration Certificates
                {!docsFromCatalog && !catalogLoading && (
                  <span className="ml-1.5 normal-case tracking-normal text-muted-foreground/70">
                    (included)
                  </span>
                )}
              </div>
              <ul className="space-y-2.5">
                {COMPANY_CERTIFICATES.map((label) => (
                  <li key={label} className="flex items-start gap-2 text-[12px]">
                    <CheckCircle2 className="size-3.5 text-success shrink-0 mt-0.5" />
                    <span className="text-foreground">{label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-7 rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
              <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
              <div className="text-[11px] text-foreground/70 leading-relaxed">
                Cloudcrest BM associates handle filing end-to-end and deliver all registration certificates upon company incorporation.
              </div>
            </div>
          </div>
        </aside>


      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="company"
        serviceTitle={`Company Registration — ${selected.title}`}
        authority="MCA"
        form={selected.form}
        initialEmail={applicantEmail}
        initialPhone={applicantPhone}
        capital={isGuarantee ? undefined : capital}
        paidCapital={isGuarantee ? undefined : paidCapital}
        formData={{
          companyType: selected.title,
          name1: withSuffix(name1),
          name2: withSuffix(name2),
          suffix: effectiveSuffix,
          objects,
          ...(effectiveIndustry ? { industryType: effectiveIndustry } : {}),
          address,
          city,
          state,
          pincode,
          directors,
          // Guarantee companies file a member count and no share capital; share
          // companies file shareholders + authorised/paid-up capital.
          ...(isGuarantee
            ? { members, liability: LIABILITY_LABEL.guarantee }
            : {
                shareholders,
                capital,
                paidCapital,
                ...(liabilityChoice ? { liability: LIABILITY_LABEL.shares } : {}),
              }),
          ...(classable ? { entityClass: entityClass === "public" ? "Public" : "Private" } : {}),
          ...(selected.requiresNominee && nominee.trim() ? { nominee: nominee.trim() } : {}),
          directorsAreShareholders: sameDirShar ? "Yes" : "No",
          ...(!sameDirShar ? { additionalShareholders } : {}),
          ...(dins.some((d) => d.din.trim() || d.name.trim())
            ? { existingDins: dins.filter((d) => d.din.trim() || d.name.trim()).map((d) => `${d.din.trim() || "New DIN"} — ${d.name.trim() || "—"}`).join("; ") }
            : {}),
        }}
        documents={documents}
        fees={fees.lines}
        feeTotal={fees.total}
        feeContext={feeContext}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your company incorporation — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/company"
      />

      {/* "How would you like to proceed?" popup — opened by clicking a type card.
          "Fill on your own" advances to the Structure step; the other two hand off
          to a Cloudcrest advisor by phone call or WhatsApp. */}
      {proceedOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setProceedOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-elev p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold">How would you like to proceed?</div>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Continue with{" "}
                  <span className="font-medium text-foreground/80">{selected.title}</span>{" "}
                  yourself, or let a Cloudcrest advisor handle the filing for you.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProceedOpen(false)}
                className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => { setProceedOpen(false); next(); }}
                className="group w-full flex items-center gap-3 text-left p-4 rounded-xl border border-primary bg-primary/[0.06] ring-focus hover:shadow-card transition-all"
              >
                <span className="size-10 rounded-lg grid place-items-center gradient-brand text-white shadow-brand shrink-0">
                  <PenLine className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    Fill on your own
                    <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    Continue to structure, name, office and the rest.
                  </span>
                </span>
              </button>

              <a
                href={ADVISOR_TEL}
                className="group w-full flex items-center gap-3 text-left p-4 rounded-xl border border-border bg-surface ring-focus hover:border-primary/50 hover:shadow-card transition-all"
              >
                <span className="size-10 rounded-lg grid place-items-center bg-primary/10 text-primary group-hover:gradient-brand group-hover:text-white transition-all shrink-0">
                  <Phone className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Talk to an advisor</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">Call {ADVISOR_PHONE_DISPLAY}</span>
                </span>
              </a>

              <a
                href={`${ADVISOR_WHATSAPP}?text=${encodeURIComponent(`Hi, I'd like help registering a ${selected.title}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group w-full flex items-center gap-3 text-left p-4 rounded-xl border border-border bg-surface ring-focus hover:border-primary/50 hover:shadow-card transition-all"
              >
                <span className="size-10 rounded-lg grid place-items-center bg-success/12 text-success group-hover:bg-success group-hover:text-white transition-all shrink-0">
                  <MessageCircle className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Text on WhatsApp</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">Chat on {ADVISOR_PHONE_DISPLAY}</span>
                </span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------- primitives -------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6">
      {children}
    </div>
  );
}
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-eyebrow mb-1.5">{label}</div>
      {children}
      {error && (
        <p className="mt-1 text-[11px] font-medium text-destructive flex items-center gap-1 animate-in fade-in-50">
          <AlertTriangle className="size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
function Input({
  value, onChange, placeholder, error,
}: { value: string; onChange: (v: string) => void; placeholder?: string; error?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={
        "w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " +
        (error ? "border-destructive focus:ring-destructive/25" : "border-border")
      }
    />
  );
}
function NumberInput({
  value, onChange, min = 0, max, step = 1, placeholder, error,
}: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; placeholder?: string; error?: string }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={(e) => onChange(Number(e.target.value))}
      className={
        "w-full bg-input border rounded-lg px-3 py-2.5 text-sm mono ring-focus transition-shadow " +
        (error ? "border-destructive focus:ring-destructive/25" : "border-border")
      }
    />
  );
}

/** A selectable option tile used for the Class / Liability choices. */
function OptionCard({
  active,
  onClick,
  title,
  subtitle,
  tooltip,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  tooltip?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={
        "text-left p-3.5 rounded-lg border transition-all hover-lift ring-focus cursor-pointer relative flex flex-col justify-between " +
        (active
          ? "border-primary ring-2 ring-primary/25 bg-primary/[0.04]"
          : "border-border hover:border-border-strong bg-surface")
      }
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={
                "size-3.5 rounded-full border-2 grid place-items-center shrink-0 " +
                (active ? "border-primary" : "border-border-strong")
              }
            >
              {active && <span className="size-1.5 rounded-full bg-primary" />}
            </span>
            <span className="text-sm font-semibold leading-tight">{title}</span>
          </div>
          {tooltip && (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="p-1 rounded-full text-muted-foreground hover:text-primary hover:bg-muted/60 transition-colors shrink-0 cursor-pointer"
                    aria-label="Info"
                  >
                    <Info className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs p-2.5 text-xs bg-slate-900 text-slate-100 shadow-xl border border-slate-700 z-50">
                  <p className="leading-relaxed">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground mt-1.5 pl-[22px]">{subtitle}</div>
      </div>
    </div>
  );
}

function FeeStack({ fees }: { fees: ResolvedFees }) {
  return (
    <div className="space-y-2.5">
      {fees.lines.map((line) => (
        <div key={line.label} className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">{line.label}</span>
          <span className="mono text-foreground">₹ {line.amount.toLocaleString("en-IN")}</span>
        </div>
      ))}
      <div className="pt-3 mt-2 border-t border-border flex justify-between items-baseline">
        <span className="text-xs font-semibold">Total Estimate</span>
        <span className="mono text-2xl font-semibold text-primary">
          ₹ {fees.total.toLocaleString("en-IN")}
        </span>
      </div>
    </div>
  );
}

function FeeBreakdown({
  fees,
  loading,
  signedIn,
  onSignIn,
}: {
  fees: ResolvedFees;
  loading: boolean;
  signedIn: boolean;
  onSignIn: () => void;
}) {
  // Pricing is for customers only — the backend withholds it when signed out.
  if (!signedIn) {
    return (
      <div className="rounded-xl border border-border bg-surface shadow-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Sign in to view fees</h3>
        </div>
        <p className="text-[13px] text-muted-foreground max-w-[60ch]">
          Fee estimates are available to signed-in customers. Sign in to see the
          breakdown, download the summary and submit your application.
        </p>
        <button
          onClick={onSignIn}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all"
        >
          Sign in to continue <ArrowRight className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Fee Breakdown</h3>
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground py-4">Loading current pricing…</div>
      ) : (
        <FeeStack fees={fees} />
      )}
    </div>
  );
}

function SummaryPreview({
  selected, entityLabel, suffix, name1, state, directors, shareholders, capital, isGuarantee, members, fees,
}: {
  selected: { title: string; suffix: string; form: string };
  entityLabel: string;
  suffix: string;
  name1: string; state: string; directors: number; shareholders: number;
  capital: number; isGuarantee: boolean; members: number; fees: ResolvedFees;
}) {
  const rows = [
    ["Entity", entityLabel],
    ["Proposed Name", name1 ? `${name1} ${suffix}` : "—"],
    ["Filing Form", selected.form],
    ["Directors", String(directors)],
    // A guarantee company has members and no share capital; a company limited by
    // shares has shareholders and an authorised capital.
    ...(isGuarantee
      ? ([["Members", String(members)]] as [string, string][])
      : ([
          ["Shareholders", String(shareholders)],
          ["Authorised Capital", `₹ ${capital.toLocaleString("en-IN")}`],
        ] as [string, string][])),
    ["Registered State", state],
  ];
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="label-eyebrow text-primary">Application Summary · Draft</div>
        <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning">
          NOT SUBMITTED
        </span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between items-baseline border-b border-border pb-2.5">
            <dt className="text-[11px] text-muted-foreground uppercase tracking-wider">{k}</dt>
            <dd className="text-sm font-semibold mono text-foreground text-right">{v}</dd>
          </div>
        ))}
      </dl>

      {/* Itemised fee breakdown so the draft shows exactly what the total is
          made of (same lines carried into the PDF and the submission). */}
      <div className="mt-6 pt-5 border-t border-border">
        <div className="label-eyebrow mb-3 text-primary">Fee Breakdown</div>
        <FeeStack fees={fees} />
      </div>
    </div>
  );
}
