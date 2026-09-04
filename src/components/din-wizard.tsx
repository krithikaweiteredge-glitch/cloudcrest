import { useEffect, useMemo, useState } from "react";
import { Stepper } from "@/components/stepper";
import { RegisterDialog } from "@/components/register-dialog";
import { useAuth } from "@/hooks/use-auth";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useCatalogService, resolveFees } from "@/lib/service-catalog";
import { ServiceDetailPage } from "@/components/service-detail-page";
import {
  FeesStep, NoteBox, OptionCard, Section, WizardActions, WizardHero, WizardSidebar,
  downloadSummaryPdf, fetchProfileContact, format10DigitPhone,
} from "@/components/wizard-ui";
import { AlertTriangle, ShieldCheck, Zap } from "lucide-react";

/**
 * Director Identification Number (DIN) wizard — source: "DIN.docx".
 *
 * DIN turns on exactly one question: is the applicant an Indian citizen or a
 * foreign citizen? That choice is the whole form — it decides which identity
 * documents the MCA will accept — so the wizard is deliberately three steps:
 * pick the applicant type, see the fee, submit.
 *
 * Every personal detail (name, contact) is collected by RegisterDialog at
 * submit, and so are the documents: the choice made here changes the `documents`
 * list handed to that dialog, which becomes one upload slot per entry. The
 * wizard never prints the checklist as read-only text — the applicant sees it
 * where the files actually go.
 */
const STEPS = [
  { key: "citizenship", label: "Applicant Type" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

type Citizenship = "indian" | "foreign";

/**
 * Upload checklists, verbatim from the docx "Documents required" section.
 *
 * DSC is listed in the docx only under the Indian-citizen requirements, but
 * DIR-3 is an e-form that has to be digitally signed by the applicant whichever
 * passport they hold — so it is carried on both lists rather than leaving the
 * foreign checklist unfileable.
 */
const DOCS: Record<Citizenship, string[]> = {
  indian: [
    "Passport-size colour photograph",
    "PAN card (mandatory)",
    "Aadhaar card",
    "Address proof — Aadhaar / Passport / Voter ID / Driving Licence / bank statement / utility bill (not older than 2 months)",
    "Digital Signature Certificate (DSC)",
  ],
  foreign: [
    "Passport (mandatory)",
    "Address proof of the residential address outside India — bank statement / utility bill / government-issued address proof",
    "Passport-size colour photograph",
    "Notarised and apostilled identity & address proofs, translated into English in the applicant's country",
    "Digital Signature Certificate (DSC)",
  ],
};

const CITIZENSHIP_LABEL: Record<Citizenship, string> = {
  indian: "Indian Citizen",
  foreign: "Foreign Citizen",
};

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "MCA Form DIR-3 Filing" },
  { icon: Zap, label: "Lifetime 8-digit DIN" },
];

const DIN_CERTIFICATES = ["DIN allotment letter (MCA)"];

/** ₹999 + 18% GST, per the docx ("Professional Fee : 999+gst"). No MCA fee is
 *  charged on a standalone DIR-3 allotment. Overridden by admin pricing on the
 *  `din` catalog row. */
const FEE_FALLBACK = { professional: 999, govt: 0, gstPercent: 18 };

/**
 * DIN module entry point — the tabbed service page is the landing view and
 * "Start Application" swaps it for the stepper, same shape as MSME / NGO Darpan.
 */
export function DinModule({ initialName }: { initialName?: string }) {
  const [applying, setApplying] = useState(false);

  if (applying) {
    return <DinWizard initialName={initialName} onBack={() => setApplying(false)} />;
  }
  return <ServiceDetailPage slug="din" onStartApplication={() => setApplying(true)} />;
}

export function DinWizard({ initialName, onBack: onExit }: { initialName?: string; onBack?: () => void }) {
  const { user } = useAuth();

  const [step, setStep] = useState(0);

  // The one question the whole application hangs off.
  const [citizenship, setCitizenship] = useState<Citizenship | "">("");

  // Contact details are only carried through to prefill RegisterDialog — the
  // wizard itself never asks for them.
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);
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
  const isForeign = citizenship === "foreign";

  const { service, loading: catalogLoading } = useCatalogService(["din"]);
  const fees = resolveFees(service, "MCA", FEE_FALLBACK);
  const total = fees.total;

  const professionalFee =
    (fees.lines.find((l) => /professional/i.test(l.label))?.amount || 0) || FEE_FALLBACK.professional;

  /**
   * The checklist the applicant sees, and the one RegisterDialog turns into
   * upload slots. Deliberately NOT run through resolveDocuments(): the catalog
   * holds one flat list per service and cannot express the Indian / foreign
   * split the docx specifies, so the split wins here. Pricing still comes from
   * the catalog above.
   */
  const documents = useMemo(() => (citizenship ? DOCS[citizenship] : []), [citizenship]);

  const next = () => {
    if (!user) {
      setOpenSignIn(true);
      return;
    }
    if (step === 0 && !citizenship) {
      setStepError("Please tell us whether the applicant is an Indian or a foreign citizen.");
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    setStepError(null);
  };

  const back = () => {
    setStep((s) => Math.max(0, s - 1));
    setStepError(null);
  };

  const onDownload = () =>
    downloadSummaryPdf(
      {
        title: "Director Identification Number (DIN)",
        name1: initialName || "",
        form: "DIR-3",
        objects: citizenship ? CITIZENSHIP_LABEL[citizenship] : "",
        fees: fees.lines,
        total,
      },
      "DIN_Summary.pdf",
    );

  return (
    <div>
      <WizardHero
        eyebrow="MCA · Form DIR-3"
        title="Director Identification Number"
        blurb="Guided Cloudcrest BM workspace for a DIN — the unique 8-digit number the MCA allots to every person who wants to be a director in a company or a designated partner in an LLP. Allotted once, yours for life."
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
                ← Back to DIN service details
              </button>
            )}

            <div className="mb-6">
              <div className="label-eyebrow mb-2 text-primary">DIN Allotment · MCA / DIR-3</div>
              <h2 className="text-2xl font-semibold tracking-tight">DIN Application Wizard</h2>
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
                <span className="font-semibold text-foreground">One DIN per person · </span>
                A DIN is allotted to an individual, never to a company or a firm, and only once. If you
                already hold one, use it for every directorship rather than applying again.
              </div>
            </div>

            <div key={step} className="mt-8 animate-in-up">
              {/* STEP 1 — CITIZENSHIP */}
              {stepKey === "citizenship" && (
                <Section
                  title="Is the applicant an Indian citizen or a foreign citizen?"
                  desc="This is the only question that changes the DIN application — it sets which identity documents the MCA will accept."
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <OptionCard
                      active={citizenship === "indian"}
                      onClick={() => { setCitizenship("indian"); setStepError(null); }}
                      title="Indian Citizen"
                      subtitle="PAN is mandatory, with Aadhaar or another address proof."
                    />
                    <OptionCard
                      active={citizenship === "foreign"}
                      onClick={() => { setCitizenship("foreign"); setStepError(null); }}
                      title="Foreign Citizen"
                      subtitle="Passport is mandatory; proofs must be notarised and apostilled."
                    />
                  </div>

                  {citizenship && (
                    <>
                      <NoteBox>
                        {isForeign ? (
                          <>
                            <span className="font-semibold text-foreground">Foreign citizen · </span>
                            Every supporting document has to be translated into English, then notarised
                            and apostilled in the applicant's own country before it can be attached to
                            DIR-3.
                          </>
                        ) : (
                          <>
                            <span className="font-semibold text-foreground">Indian citizen · </span>
                            PAN is mandatory and the name, father's name and date of birth on the form
                            must match the PAN record exactly, or the MCA rejects it.
                          </>
                        )}
                      </NoteBox>
                    </>
                  )}
                </Section>
              )}

              {/* STEP 2 — FEES */}
              {stepKey === "fees" && (
                <FeesStep
                  signedIn={!!user}
                  onSignIn={() => setOpenSignIn(true)}
                  loading={catalogLoading}
                  lines={fees.lines}
                  total={total}
                  heading="Estimated DIN Fee Breakdown"
                  unpricedNote="Pricing for DIN isn't published yet. Your Cloudcrest BM advisor will confirm the fee before any payment — you can still submit the application now."
                />
              )}

              {/* STEP 3 — SUMMARY */}
              {stepKey === "summary" && (
                <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary">
                      DIN Application Preview
                    </div>
                    <span className="text-[10px] mono px-2 py-0.5 rounded bg-warning/15 text-warning font-semibold">
                      READY TO SUBMIT
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Applicant Type</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {citizenship ? CITIZENSHIP_LABEL[citizenship] : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Form</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">DIR-3</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Authority</dt>
                      <dd className="font-semibold text-foreground mt-0.5">Ministry of Corporate Affairs</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Total Estimated Cost</dt>
                      <dd className="font-semibold text-foreground mt-0.5 mono">
                        {total > 0 ? `₹ ${total.toLocaleString("en-IN")}` : "To be confirmed"}
                      </dd>
                    </div>
                  </dl>

                  <p className="text-[11px] text-muted-foreground">
                    Your name, contact details and the document uploads are all collected on the next
                    screen when you submit.
                  </p>
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
          selection={[{ label: "Applicant Type", value: citizenship ? CITIZENSHIP_LABEL[citizenship] : "" }]}
          professionalFee={professionalFee}
          gstPercent={FEE_FALLBACK.gstPercent}
          formNo="DIR-3"
          certificates={DIN_CERTIFICATES}
        />
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug="din"
        serviceTitle="Director Identification Number (DIN)"
        authority="MCA"
        form="DIR-3"
        initialEmail={email}
        initialPhone={phone}
        formData={{
          citizenship,
          citizenshipLabel: citizenship ? CITIZENSHIP_LABEL[citizenship] : "",
        }}
        documents={documents}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to continue your DIN application — we'll save your progress, show the fee breakdown and let you submit the application."
        next="/m/din"
      />
    </div>
  );
}
