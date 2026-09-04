import { useMemo, useState, useEffect } from "react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { useAuth } from "@/hooks/use-auth";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useCatalogService, resolveFees } from "@/lib/service-catalog";
import { ServiceDetailPage } from "@/components/service-detail-page";
import {
  AlertTriangle, Download, ArrowLeft, ArrowRight, CheckCircle2,
  FileText, Info, ShieldCheck, Zap, Send, Lock, Factory,
} from "lucide-react";

/**
 * MSME (Udyam) registration wizard.
 *
 * Step order follows "Registration flow for MSME.docx", which re-orders the
 * sections of the source HTML mock rather than taking them as-is:
 *   Tab 1 = HTML §2 Enterprise & Legal Profile
 *   Tab 2 = HTML §1 Entrepreneur / Applicant Details
 *   Tab 3 = HTML §5 Employment & Financial Thresholds  (investment/turnover optional)
 *   Tab 4 = HTML §4 Bank Account & Business Activity   (bank optional — or upload a cheque)
 * HTML §3 (plant / office address) is deliberately absent from that mapping, so
 * the address is not collected here; the registered-address proof is carried as
 * an uploaded document instead.
 */
const STEPS = [
  { key: "enterprise", label: "Enterprise" },
  { key: "applicant", label: "Applicant" },
  { key: "classification", label: "Classification" },
  { key: "bank", label: "Bank & Activity" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

/** Udyam's organisation types, as listed on the government form. */
const ORG_TYPES = [
  { value: "Proprietary", label: "Proprietary" },
  { value: "HUF", label: "Hindu Undivided Family (HUF)" },
  { value: "Partnership", label: "Partnership" },
  { value: "CoOperative", label: "Co-Operative" },
  { value: "PvtLtd", label: "Private Limited Company" },
  { value: "PubLtd", label: "Public Limited Company" },
  { value: "SHG", label: "Self Help Group" },
  { value: "LLP", label: "Limited Liability Partnership (LLP)" },
  { value: "Society", label: "Society" },
  { value: "Trust", label: "Trust" },
  { value: "Others", label: "Others" },
];

const SOCIAL_CATEGORIES = ["General", "SC (Scheduled Caste)", "ST (Scheduled Tribe)", "OBC (Other Backward Class)"];
const GENDERS = ["Male", "Female", "Others"];

/**
 * Document checklist per organisation type, from the docx. Every type also needs
 * turnover and plant/equipment value details; bank proof is appended only when
 * the applicant hasn't typed their bank details in step 4.
 */
const COMMON_TAIL = ["Turnover details", "Plant & machinery / equipment value details"];

const DOCS_BY_ORG: Record<string, string[]> = {
  Proprietary: ["Proprietor Aadhaar", "Proprietor PAN", "Registered address proof", ...COMMON_TAIL],
  HUF: ["Karta Aadhaar", "HUF PAN", ...COMMON_TAIL],
  Partnership: ["Managing Partner Aadhaar", "Firm / business PAN", "Signed partnership deed", ...COMMON_TAIL],
  LLP: ["Designated Partner Aadhaar", "LLP PAN", "LLP Certificate of Incorporation", ...COMMON_TAIL],
  PvtLtd: ["Authorised Director Aadhaar", "Company PAN", "Company Certificate of Incorporation", ...COMMON_TAIL],
  PubLtd: ["Authorised Director Aadhaar", "Company PAN", "Company Certificate of Incorporation", ...COMMON_TAIL],
  Trust: ["Authorised Signatory Aadhaar", "Entity PAN", "Registration certificate", ...COMMON_TAIL],
  Society: ["Authorised Signatory Aadhaar", "Entity PAN", "Registration certificate", ...COMMON_TAIL],
  // The docx doesn't enumerate these three; they follow the Trust/Society shape,
  // which is the generic "registered entity + authorised signatory" case.
  CoOperative: ["Authorised Signatory Aadhaar", "Entity PAN", "Registration certificate", ...COMMON_TAIL],
  SHG: ["Authorised Signatory Aadhaar", "Entity PAN", "Registration certificate", ...COMMON_TAIL],
  Others: ["Authorised Signatory Aadhaar", "Entity PAN", "Registration certificate", ...COMMON_TAIL],
};

const BANK_DOC = "Bank details — cancelled cheque / passbook copy";

/** Certificates delivered on completion (docx: "Certificates they get: MSME Certificate"). */
const MSME_CERTIFICATES = ["MSME Certificate"];

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Udyam Portal Filing" },
  { icon: Zap, label: "Certificate in 1 Working Day" },
];

// Fee is a flat professional fee plus GST — Udyam registration carries no
// government fee. Overridden by admin pricing on the `msme` catalog row.
const FEE_FALLBACK = { professional: 1000, govt: 0, gstPercent: 18 };

function format10DigitPhone(phoneStr?: string | null): string {
  if (!phoneStr) return "";
  let cleaned = phoneStr.trim();
  if (cleaned.startsWith("+91")) cleaned = cleaned.slice(3);
  else if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(2);
  cleaned = cleaned.replace(/\D/g, "");
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
}

/**
 * MSME module entry point. The tabbed service page (About / Who can apply /
 * Documents / Acts & Rules) stays as the landing view; "Start Application"
 * swaps it for the stepper below rather than the generic inline fee panel.
 */
export function MsmeModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <MsmeWizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug="msme" onStartApplication={() => setApplying(true)} />;
}

export function MsmeWizard({ initialName, onBack: onExit }: { initialName?: string; onBack?: () => void }) {
  const { user } = useAuth();

  const [step, setStep] = useState(0);

  // Step 1 — Enterprise & legal profile (HTML §2).
  const [enterpriseName, setEnterpriseName] = useState(initialName || "");
  const [orgType, setOrgType] = useState("Proprietary");

  // Step 2 — Entrepreneur / applicant (HTML §1).
  const [socialCategory, setSocialCategory] = useState("");
  const [gender, setGender] = useState("");
  const [speciallyAbled, setSpeciallyAbled] = useState("No");
  const [applicantPhone, setApplicantPhone] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");

  // Step 3 — Employment & thresholds (HTML §5). Investment/turnover are optional
  // per the docx: "This investment and turnover should be optional".
  const [empMale, setEmpMale] = useState(0);
  const [empFemale, setEmpFemale] = useState(0);
  const [empOthers, setEmpOthers] = useState(0);
  const [investment, setInvestment] = useState("");
  const [turnover, setTurnover] = useState("");

  // Step 4 — Bank & activity (HTML §4). Bank is optional to type: the applicant
  // may instead upload a cancelled cheque, per the docx.
  const [bankMode, setBankMode] = useState<"details" | "cheque">("details");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [majorActivity, setMajorActivity] = useState("");
  const [subActivity, setSubActivity] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);

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

  const stepKey = STEPS[step]?.key;
  const isServices = majorActivity === "Services";
  const bankFilled = bankMode === "details" && !!bankName.trim() && !!accountNumber.trim() && !!ifsc.trim();

  const orgLabel = useMemo(
    () => ORG_TYPES.find((o) => o.value === orgType)?.label || orgType,
    [orgType],
  );

  const { service, loading: catalogLoading } = useCatalogService(["msme"]);

  // Checklist follows the organisation type, and gains the bank proof line only
  // when the applicant chose to upload a cheque instead of typing bank details.
  //
  // Deliberately NOT run through resolveDocuments(): the catalog holds one flat
  // list per service, which can't express Udyam's per-organisation-type
  // checklist (a proprietor's Aadhaar vs an LLP's COI). The docx specifies that
  // variation, so it wins here. Pricing still comes from the catalog below.
  const documents = useMemo(() => {
    const base = DOCS_BY_ORG[orgType] ?? DOCS_BY_ORG.Others;
    return bankFilled ? base : [...base, BANK_DOC];
  }, [orgType, bankFilled]);

  const fees = resolveFees(service, "MoMSME", FEE_FALLBACK);

  // Pull the professional / GST amounts back out of the resolved lines so the
  // sidebar quotes the same figures as the Fees step. Admin-authored fee_lines
  // label them freely ("Gst@18%"), hence the loose match.
  const professionalFee =
    (fees.lines.find((l) => /professional/i.test(l.label))?.amount || 0) || FEE_FALLBACK.professional;
  const gstAmount = fees.lines.find((l) => /gst/i.test(l.label))?.amount ?? 0;
  const total = fees.total;

  const totalEmployees = empMale + empFemale + empOthers;

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    let globalMsg: string | null = null;

    const fail = (field: string, msg: string) => {
      newErrors[field] = msg;
      if (!globalMsg) globalMsg = msg;
    };

    if (currentStep === 0) {
      if (!enterpriseName.trim()) fail("enterpriseName", "Please enter the name of the enterprise.");
      if (!orgType) fail("orgType", "Please select the type of organisation.");
    } else if (currentStep === 1) {
      if (!socialCategory) fail("socialCategory", "Please select a social category.");
      if (!gender) fail("gender", "Please select a gender.");
      if (!speciallyAbled) fail("speciallyAbled", "Please indicate specially abled (Divyangjan) status.");
      if (!/^[6-9]\d{9}$/.test(applicantPhone.trim())) fail("applicantPhone", "Enter a valid 10-digit Indian mobile number.");
      if (!/^\S+@\S+\.\S+$/.test(applicantEmail.trim())) fail("applicantEmail", "Enter a valid email address.");
    } else if (currentStep === 2) {
      // Investment and turnover stay optional (docx). Only the headcount is checked.
      if ([empMale, empFemale, empOthers].some((n) => !Number.isFinite(n) || n < 0)) {
        fail("employment", "Employee counts cannot be negative.");
      }
      if (investment.trim() && Number(investment) < 0) fail("investment", "Investment cannot be negative.");
      if (turnover.trim() && Number(turnover) < 0) fail("turnover", "Turnover cannot be negative.");
    } else if (currentStep === 3) {
      if (bankMode === "details") {
        if (!bankName.trim()) fail("bankName", "Bank name is required — or switch to uploading a cancelled cheque.");
        if (!accountNumber.trim()) fail("accountNumber", "Account number is required — or upload a cancelled cheque.");
        if (!ifsc.trim()) fail("ifsc", "IFSC code is required — or upload a cancelled cheque.");
        else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase())) fail("ifsc", "Enter a valid IFSC (e.g. HDFC0001234).");
      }
      if (!majorActivity) fail("majorActivity", "Please select the major activity of the enterprise.");
      if (isServices && !subActivity) fail("subActivity", "Please select the service sub-activity.");
      if (!businessDescription.trim()) fail("businessDescription", "Please describe the business / product.");
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

  const downloadSummaryPdf = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/summary/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "MSME / Udyam Registration",
          name1: enterpriseName,
          form: "Udyam",
          objects: businessDescription,
          fees: fees.lines,
          total,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate PDF summary");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `MSME_Udyam_Summary_${enterpriseName ? enterpriseName.trim().replace(/\s+/g, "_") : "Enterprise"}.pdf`;
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
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, oklch(0.7 0.19 45 / 0.4), transparent 40%), radial-gradient(circle at 80% 80%, oklch(0.6 0.18 240 / 0.5), transparent 45%)",
          }}
        />
        <div className="hero-grid" />
        <div className="relative px-10 py-10 max-w-5xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[11px] mono uppercase tracking-widest text-white/90">
            <span className="size-1.5 rounded-full bg-primary live-dot" />
            MoMSME · Udyam Registration Portal
          </span>
          <h1 className="mt-4 text-4xl md:text-[42px] font-semibold font-display tracking-tight leading-[1.05]">
            MSME / Udyam Registration
          </h1>
          <p className="mt-3 text-white/70 max-w-2xl text-[15px] leading-relaxed">
            Guided Cloudcrest BM workspace for Udyam registration — enterprise profile,
            Aadhaar-linked entrepreneur details, employment and turnover declaration, and
            certificate delivery.
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
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-10 py-8 animate-in-up">
            {onExit && (
              <button
                onClick={onExit}
                className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <ArrowLeft className="size-3.5" /> Back to MSME service details
              </button>
            )}

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">MSME Registration · MoMSME / Udyam</div>
              <h2 className="text-2xl font-semibold tracking-tight">Udyam Registration Wizard</h2>
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

            <div key={step} className="mt-8 animate-in-up">
              {/* STEP 1 — ENTERPRISE (HTML §2) */}
              {stepKey === "enterprise" && (
                <Section
                  title="Enterprise & Legal Profile"
                  desc="The registered identity of the business being enrolled under Udyam."
                >
                  <Field label="Name of Enterprise (Business Name) *" error={errors.enterpriseName}>
                    <Input
                      value={enterpriseName}
                      onChange={setEnterpriseName}
                      placeholder="e.g. Sunrise Textiles"
                      error={errors.enterpriseName}
                    />
                  </Field>

                  <Field label="Type of Organisation *" error={errors.orgType}>
                    <Select value={orgType} onChange={setOrgType} error={errors.orgType}>
                      {ORG_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </Field>

                  <div className="rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
                    <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
                    <div className="text-[11px] text-foreground/70 leading-relaxed">
                      The organisation type decides your document checklist — it updates in the panel
                      on the right as you change it.
                    </div>
                  </div>
                </Section>
              )}

              {/* STEP 2 — APPLICANT (HTML §1) */}
              {stepKey === "applicant" && (
                <Section
                  title="Entrepreneur / Applicant Details"
                  desc="Details of the proprietor, karta, partner, director or authorised signatory."
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Social Category *" error={errors.socialCategory}>
                      <Select value={socialCategory} onChange={setSocialCategory} error={errors.socialCategory}>
                        <option value="">— Select category —</option>
                        {SOCIAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </Select>
                    </Field>
                    <Field label="Gender *" error={errors.gender}>
                      <Select value={gender} onChange={setGender} error={errors.gender}>
                        <option value="">— Select gender —</option>
                        {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                      </Select>
                    </Field>
                    <Field label="Specially Abled (Divyangjan) *" error={errors.speciallyAbled}>
                      <Select value={speciallyAbled} onChange={setSpeciallyAbled} error={errors.speciallyAbled}>
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </Select>
                    </Field>
                    <Field label="Applicant Mobile Number *" error={errors.applicantPhone}>
                      <Input
                        value={applicantPhone}
                        onChange={(v) => setApplicantPhone(v.replace(/[^\d]/g, "").slice(0, 10))}
                        placeholder="10-digit mobile"
                        error={errors.applicantPhone}
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="Applicant Email ID *" error={errors.applicantEmail}>
                        <Input value={applicantEmail} onChange={setApplicantEmail} placeholder="name@example.com" error={errors.applicantEmail} />
                      </Field>
                    </div>
                  </div>
                </Section>
              )}

              {/* STEP 3 — CLASSIFICATION (HTML §5) */}
              {stepKey === "classification" && (
                <Section
                  title="Employment & Financial Thresholds"
                  desc="Used to classify the enterprise as Micro, Small or Medium. Your advisor confirms the final category before filing."
                >
                  <div>
                    <div className="text-xs font-medium text-foreground/90 mb-2">Number of Persons Employed</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field label="Male">
                        <NumberInput value={empMale} onChange={setEmpMale} min={0} error={errors.employment} />
                      </Field>
                      <Field label="Female">
                        <NumberInput value={empFemale} onChange={setEmpFemale} min={0} error={errors.employment} />
                      </Field>
                      <Field label="Others">
                        <NumberInput value={empOthers} onChange={setEmpOthers} min={0} error={errors.employment} />
                      </Field>
                    </div>
                    {errors.employment && <ErrText>{errors.employment}</ErrText>}
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      Total persons employed: <span className="mono font-semibold text-foreground">{totalEmployees}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border">
                    <Field label="Total Investment in Plant & Machinery (INR)" error={errors.investment}>
                      <Input
                        value={investment}
                        onChange={(v) => setInvestment(v.replace(/[^\d]/g, ""))}
                        placeholder="Excluding land and building"
                        error={errors.investment}
                      />
                    </Field>
                    <Field label="Total Annual Turnover (INR)" error={errors.turnover}>
                      <Input
                        value={turnover}
                        onChange={(v) => setTurnover(v.replace(/[^\d]/g, ""))}
                        placeholder="Total sales / revenue"
                        error={errors.turnover}
                      />
                    </Field>
                  </div>

                  <div className="rounded-lg border border-accent/25 bg-accent/6 p-3 flex gap-2">
                    <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
                    <div className="text-[11px] text-foreground/70 leading-relaxed">
                      Investment and turnover are <span className="font-semibold">optional here</span> — leave them
                      blank and submit the turnover and plant &amp; equipment value documents instead.
                    </div>
                  </div>
                </Section>
              )}

              {/* STEP 4 — BANK & ACTIVITY (HTML §4) */}
              {stepKey === "bank" && (
                <Section
                  title="Bank Account & Business Activity"
                  desc="Bank details can be typed here, or skipped in favour of uploading a cancelled cheque with your documents."
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <OptionCard
                      active={bankMode === "details"}
                      onClick={() => { setBankMode("details"); setErrors({}); setStepError(null); }}
                      title="Enter bank details"
                      subtitle="Type the bank name, account number and IFSC now."
                    />
                    <OptionCard
                      active={bankMode === "cheque"}
                      onClick={() => { setBankMode("cheque"); setErrors({}); setStepError(null); }}
                      title="Upload a cancelled cheque"
                      subtitle="Skip the fields — we'll collect a cheque or passbook copy with your documents."
                    />
                  </div>

                  {bankMode === "details" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Field label="Bank Name *" error={errors.bankName}>
                          <Input value={bankName} onChange={setBankName} placeholder="e.g. State Bank of India" error={errors.bankName} />
                        </Field>
                      </div>
                      <Field label="Account Number *" error={errors.accountNumber}>
                        <Input
                          value={accountNumber}
                          onChange={(v) => setAccountNumber(v.replace(/[^\d]/g, ""))}
                          error={errors.accountNumber}
                        />
                      </Field>
                      <Field label="IFSC Code *" error={errors.ifsc}>
                        <Input value={ifsc} onChange={(v) => setIfsc(v.toUpperCase())} placeholder="HDFC0001234" error={errors.ifsc} />
                      </Field>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-panel p-3.5 flex gap-2">
                      <FileText className="size-3.5 text-primary shrink-0 mt-0.5" />
                      <div className="text-[11px] text-foreground/70 leading-relaxed">
                        “{BANK_DOC}” has been added to your document checklist. You'll upload it after submitting.
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border">
                    <Field label="Major Activity of Enterprise *" error={errors.majorActivity}>
                      <Select
                        value={majorActivity}
                        onChange={(v) => { setMajorActivity(v); if (v !== "Services") setSubActivity(""); }}
                        error={errors.majorActivity}
                      >
                        <option value="">— Select activity —</option>
                        <option value="Manufacturing">Manufacturing</option>
                        <option value="Services">Services</option>
                      </Select>
                    </Field>
                    {isServices && (
                      <Field label="Service Sub-Activity *" error={errors.subActivity}>
                        <Select value={subActivity} onChange={setSubActivity} error={errors.subActivity}>
                          <option value="">— Select type —</option>
                          <option value="Non-Trading">Non-Trading (Pure Services)</option>
                          <option value="Trading">Trading</option>
                        </Select>
                      </Field>
                    )}
                    <div className="md:col-span-2">
                      <Field label="Brief Description of Business / Product *" error={errors.businessDescription}>
                        <TextArea
                          value={businessDescription}
                          onChange={setBusinessDescription}
                          placeholder="e.g. Manufacturing of readymade cotton garments"
                          error={errors.businessDescription}
                        />
                      </Field>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Used to derive the NIC code for your Udyam registration.
                      </p>
                    </div>
                  </div>
                </Section>
              )}

              {/* STEP 5 — FEES */}
              {stepKey === "fees" && (
                !user ? (
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
                      onClick={() => setOpenSignIn(true)}
                      className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all"
                    >
                      Sign in to continue <ArrowRight className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="size-4 text-primary" />
                      <h3 className="text-sm font-semibold">Estimated MSME / Udyam Fee Breakdown</h3>
                    </div>
                    {catalogLoading ? (
                      <div className="text-xs text-muted-foreground py-4">Loading current pricing…</div>
                    ) : (
                      <div className="space-y-2 text-xs">
                        {fees.lines.map((line) => (
                          <div key={line.label} className="flex justify-between">
                            <span className="text-muted-foreground">{line.label}</span>
                            <span className="mono">₹ {line.amount.toLocaleString("en-IN")}</span>
                          </div>
                        ))}
                        <div className="pt-3 border-t border-border flex justify-between items-baseline font-bold text-sm">
                          <span>Total Estimated Cost</span>
                          <span className="mono text-primary text-xl">₹ {total.toLocaleString("en-IN")}</span>
                        </div>
                        {!fees.fromCatalog && (
                          <p className="pt-2 text-[11px] text-muted-foreground">
                            Indicative pricing — confirmed by your advisor before payment.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}

              {/* STEP 6 — SUMMARY */}
              {stepKey === "summary" && (
                <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary">
                      MSME / Udyam Application Preview
                    </div>
                    <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning font-semibold">
                      READY TO SUBMIT
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Enterprise</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{enterpriseName || "—"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Type of Organisation</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{orgLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Major Activity</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {majorActivity ? (isServices && subActivity ? `${majorActivity} · ${subActivity}` : majorActivity) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Persons Employed</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">{totalEmployees}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Investment in P&amp;M</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">
                        {investment ? `₹ ${Number(investment).toLocaleString("en-IN")}` : "To be declared"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Annual Turnover</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">
                        {turnover ? `₹ ${Number(turnover).toLocaleString("en-IN")}` : "To be declared"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Bank</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {bankFilled ? `${bankName} · ${ifsc.toUpperCase()}` : "Cancelled cheque to be uploaded"}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Actions */}
              <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
                <button
                  onClick={back}
                  disabled={step === 0}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-all cursor-pointer"
                >
                  <ArrowLeft className="size-3.5" /> Back
                </button>
                <div className="flex items-center gap-4">
                  {step === STEPS.length - 1 ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={downloadSummaryPdf}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Download className="size-4" /> Summary
                      </button>
                      <button
                        onClick={() => setOpenReg(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
                      >
                        <Send className="size-4" /> Submit Application
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={next}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
                    >
                      Next · {STEPS[step + 1].label}
                      <ArrowRight className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel — current selection, documents & certificate */}
        <aside className="hidden lg:block w-80 border-l border-border bg-surface">
          <div className="sticky top-16 p-6">
            <div className="label-eyebrow mb-2.5 text-primary">Current Selection</div>
            <div className="rounded-lg border border-border bg-panel p-3.5 space-y-3">
              <div>
                <div className="text-[11px] text-muted-foreground font-medium">Type of Organisation</div>
                <div className="text-sm font-semibold text-foreground mt-0.5">{orgLabel}</div>
              </div>
              <div className="pt-2.5 border-t border-border/60">
                <div className="text-[11px] text-muted-foreground font-medium">Professional Fee</div>
                <div className="text-xs font-semibold mono text-primary mt-0.5">
                  ₹{professionalFee.toLocaleString("en-IN")} + 18% GST
                </div>
              </div>
              <div className="pt-2.5 border-t border-border/60 text-[10px] mono text-primary">Form · Udyam</div>
            </div>

            <div className="mt-7">
              <div className="label-eyebrow mb-3">Registration Certificates</div>
              <ul className="space-y-2.5">
                {MSME_CERTIFICATES.map((label) => (
                  <li key={label} className="flex items-start gap-2 text-[12px]">
                    <CheckCircle2 className="size-3.5 text-success shrink-0 mt-0.5" />
                    <span className="text-foreground">{label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-7 rounded-lg border border-success/25 bg-success/6 p-3 flex gap-2">
              <Factory className="size-3.5 text-success shrink-0 mt-0.5" />
              <div className="text-[11px] text-foreground/70 leading-relaxed">
                Your MSME certificate is issued within <span className="font-semibold text-foreground">1 working day</span> of
                us receiving every document listed above.
              </div>
            </div>
          </div>
        </aside>
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="msme"
        serviceTitle="MSME / Udyam Registration"
        authority="MoMSME"
        form="Udyam"
        initialEmail={applicantEmail}
        initialPhone={applicantPhone}
        formData={{
          enterpriseName,
          orgType,
          orgTypeLabel: orgLabel,
          socialCategory,
          gender,
          speciallyAbled,
          employmentMale: empMale,
          employmentFemale: empFemale,
          employmentOthers: empOthers,
          employmentTotal: totalEmployees,
          ...(investment.trim() ? { investment: Number(investment) } : {}),
          ...(turnover.trim() ? { turnover: Number(turnover) } : {}),
          bankMode,
          ...(bankFilled ? { bankName, accountNumber, ifsc: ifsc.toUpperCase() } : {}),
          majorActivity,
          ...(isServices && subActivity ? { subActivity } : {}),
          businessDescription,
        }}
        documents={documents}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your MSME / Udyam registration — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/msme"
      />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface shadow-card p-6">{children}</div>;
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </div>
        {children}
      </div>
    </Card>
  );
}

function ErrText({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-destructive font-medium mt-1.5">{children}</p>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground/90 block">{label}</label>
      {children}
      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
    </div>
  );
}

/** A selectable option tile — used for the bank details / cancelled cheque choice. */
function OptionCard({
  active, onClick, title, subtitle,
}: { active: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-left p-3.5 rounded-lg border transition-all hover-lift ring-focus " +
        (active
          ? "border-primary ring-2 ring-primary/25 bg-primary/[0.04]"
          : "border-border hover:border-border-strong bg-surface")
      }
    >
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
      <div className="text-[11px] text-muted-foreground mt-1.5 pl-[22px]">{subtitle}</div>
    </button>
  );
}

const fieldClass = (error?: string) =>
  "w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " +
  (error ? "border-destructive focus:ring-destructive/25" : "border-border");

function Input({ value, onChange, placeholder, error }: { value: string; onChange: (v: string) => void; placeholder?: string; error?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={fieldClass(error)}
    />
  );
}

function TextArea({ value, onChange, placeholder, error }: { value: string; onChange: (v: string) => void; placeholder?: string; error?: string }) {
  return (
    <textarea
      rows={2}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={fieldClass(error)}
    />
  );
}

function Select({ value, onChange, error, children }: { value: string; onChange: (v: string) => void; error?: string; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass(error)}>
      {children}
    </select>
  );
}

function NumberInput({ value, onChange, min = 0, error }: { value: number; onChange: (v: number) => void; min?: number; error?: string }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      onChange={(e) => onChange(Number(e.target.value))}
      className={fieldClass(error) + " mono"}
    />
  );
}
