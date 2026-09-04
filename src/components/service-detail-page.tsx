import { useState, useRef, useEffect } from "react";
import { assetUrl } from "@/lib/file-url";
import {
  useCatalogService,
  resolveFees,
  type CatalogService,
  type ServiceTab,
} from "@/lib/service-catalog";
import { RegisterDialog } from "@/components/register-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { useAuth } from "@/hooks/use-auth";
import {
  Info, CheckCircle2, FileText, Gavel, Download, ArrowRight, ArrowLeft,
  Loader2, Wallet, Send, Landmark, ShieldCheck, Sparkles,
} from "lucide-react";

const BACKEND = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

/** Icon shown beside each built-in tab; custom tabs fall back to the doc icon. */
const TAB_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  about: Info,
  who: CheckCircle2,
  documents: FileText,
  acts: Gavel,
};

const inr = (n: number) => `₹ ${n.toLocaleString("en-IN")}`;

/**
 * Customer-facing page for a catalog service. Everything on it — the tab set,
 * each tab's copy, the checklist, the attachments and the fee lines — is
 * authored by an admin in the catalog panel.
 */
export function ServiceDetailPage({
  slug,
  onStartApplication,
}: {
  slug: string;
  /** See `ServiceDetail` — replaces the inline fee/summary panel. */
  onStartApplication?: () => void;
}) {
  const { service, loading } = useCatalogService([slug]);

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-6 text-center">
        <div>
          <h1 className="text-xl font-display font-semibold">Service not found</h1>
          <p className="text-sm text-muted-foreground mt-2">
            This service is not published in the catalog yet.
          </p>
        </div>
      </div>
    );
  }

  return <ServiceDetail service={service} onStartApplication={onStartApplication} />;
}

/**
 * The tabbed service page (hero + About / Who can apply / Documents / Acts &
 * Rules + the Start Application flow). Reused by the GST wizard, which builds a
 * per-type synthetic service and passes `extraFormData` so the chosen GST
 * registration type is carried onto the submitted request, plus `onBack` to
 * return to the type picker.
 */
export function ServiceDetail({
  service,
  extraFormData,
  onBack,
  backLabel = "Change type",
  onStartApplication,
}: {
  service: CatalogService;
  extraFormData?: Record<string, unknown>;
  onBack?: () => void;
  backLabel?: string;
  /**
   * Hands Start Application to the caller instead of opening the built-in
   * fee → summary panel. Services with their own multi-step wizard (MSME) use
   * this to swap the page for the stepper; the sign-in gate still runs first.
   */
  onStartApplication?: () => void;
}) {
  const { user } = useAuth();
  const tabs = service.tabs;
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "about");
  // `null` = the application panel hasn't been opened yet.
  const [stage, setStage] = useState<"fees" | "summary" | null>(null);
  const [openReg, setOpenReg] = useState(false);
  const [openSignIn, setOpenSignIn] = useState(false);

  // Every tab renders as a section stacked on the page; the tab bar scrolls to
  // the matching one. A scroll-spy keeps the active tab in sync as you scroll.
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Scroll the fee breakdown into view the moment Start Application opens it.
  const applicationRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (stage && !wasOpen.current) {
      applicationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    wasOpen.current = !!stage;
  }, [stage]);

  const scrollToSection = (id: string) => {
    setActiveTab(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const inView = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = inView?.target.getAttribute("data-tab-id");
        if (id) setActiveTab(id);
      },
      // Trigger around the upper third of the viewport so a section counts as
      // "current" once its heading reaches the top area under the sticky bar.
      { rootMargin: "-140px 0px -55% 0px", threshold: 0 },
    );
    tabs.forEach((t) => {
      const el = sectionRefs.current[t.id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [tabs]);

  const fees = resolveFees(service, service.authority || "Government", {
    professional: 0,
    govt: 0,
    gstPercent: 18,
  });

  const startApplication = () => {
    if (!user) {
      setOpenSignIn(true);
      return;
    }
    if (onStartApplication) {
      onStartApplication();
      return;
    }
    setStage("fees");
  };

  return (
    <div className="pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden gradient-hero text-white">
        {/* Drifting colour orbs + panning grid give the hero live depth. */}
        <div
          className="float-orb absolute -top-24 -left-16 size-72 rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, oklch(0.62 0.24 27 / 0.45), transparent 70%)" }}
        />
        <div
          className="float-orb absolute -bottom-28 right-0 size-80 rounded-full blur-3xl pointer-events-none"
          style={{
            background: "radial-gradient(circle, oklch(0.7 0.18 152 / 0.4), transparent 70%)",
            animationDelay: "-7s",
          }}
        />
        <div className="hero-grid" />

        <div className="relative px-6 md:px-10 pt-12 pb-16 max-w-6xl mx-auto">
          {onBack && (
            <button
              onClick={onBack}
              className="rise-in mb-5 inline-flex items-center gap-2 rounded-full bg-white/12 border border-white/25 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/20 hover:-translate-x-0.5 transition-all shadow-sm"
              style={{ "--i": 0 } as React.CSSProperties}
            >
              <ArrowLeft className="size-4" /> {backLabel}
            </button>
          )}
          <h1
            className="rise-in text-3xl md:text-5xl font-display font-semibold tracking-tight leading-[1.05] max-w-3xl"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            {service.title}
          </h1>

          <div
            className="rise-in mt-6 flex flex-wrap gap-2"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            {service.authority && <HeroChip icon={Landmark}>{service.authority}</HeroChip>}
            {service.form && <HeroChip icon={FileText}>Form · {service.form}</HeroChip>}
            <HeroChip icon={ShieldCheck}>CA / CS reviewed</HeroChip>
            <HeroChip icon={Sparkles}>Fully digital filing</HeroChip>
          </div>
        </div>
      </section>

      {/* Card overlapping the hero, matching the NSWS layout */}
      <div className="px-4 md:px-10 max-w-6xl mx-auto -mt-8 relative">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-0 rounded-xl border border-border bg-surface shadow-elev">
          {/* In-page nav + all sections stacked */}
          <div className="min-w-0">
            {/* Sticky tab bar — scrolls to each section rather than swapping content.
                top-16 clears the app's sticky header. */}
            <div
              role="tablist"
              className="sticky top-16 z-10 flex flex-wrap items-center gap-1 border-b border-border bg-surface/98 px-2 md:px-4 rounded-t-xl"
            >
              {tabs.map((tab) => {
                const Icon = TAB_ICONS[tab.id] ?? FileText;
                const active = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => scrollToSection(tab.id)}
                    className={
                      "flex items-center gap-2 px-4 py-4 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors " +
                      (active
                        ? "border-success text-success font-semibold"
                        : "border-transparent text-muted-foreground hover:text-foreground")
                    }
                  >
                    <Icon className="size-4" />
                    {tab.title}
                  </button>
                );
              })}
            </div>

            <div className="divide-y divide-border">
              {tabs.map((tab, i) => (
                <section
                  key={tab.id}
                  data-tab-id={tab.id}
                  ref={(el) => {
                    sectionRefs.current[tab.id] = el;
                  }}
                  style={{ "--i": i } as React.CSSProperties}
                  className="card-in p-6 md:p-8 scroll-mt-[132px]"
                >
                  <TabPanel tab={tab} service={service} />
                </section>
              ))}
            </div>
          </div>

          {/* Right rail */}
          <aside className="border-t lg:border-t-0 lg:border-l border-border bg-gradient-to-b from-primary/[0.06] to-transparent p-6 lg:sticky lg:top-16 lg:self-start lg:rounded-tr-xl">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="float-soft size-10 rounded-xl gradient-brand text-white grid place-items-center shadow-brand">
                <Wallet className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="label-eyebrow text-muted-foreground">Application Fee</div>
                <div className="text-sm font-semibold">Transparent pricing</div>
              </div>
            </div>
            {/* The amount is deliberately not shown here — the breakdown is
                revealed inside the application flow, behind sign-in. */}
            <div className="text-[13px] text-foreground/70">
              See the full breakdown the moment you start your application.
            </div>
            <button
              onClick={startApplication}
              className="group mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl animated-gradient gradient-brand text-white text-sm font-bold uppercase tracking-wide shadow-brand hover:shadow-elev hover:-translate-y-0.5 transition-all"
            >
              Start Application
              <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            {!user && (
              <p className="mt-3 text-[11px] text-muted-foreground text-center">
                Sign in required to view fees.
              </p>
            )}
          </aside>
        </div>

        {/* Application flow */}
        <div ref={applicationRef} className="scroll-mt-[80px]">
          {stage && (
            <ApplicationPanel
              service={service}
              fees={fees}
              stage={stage}
              setStage={setStage}
              onSubmit={() => setOpenReg(true)}
            />
          )}
        </div>
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug={service.slug}
        serviceTitle={service.title}
        authority={service.authority}
        form={service.form}
        documents={service.documents}
        formData={extraFormData}
        fees={fees.lines}
        feeTotal={fees.total}
      />

      <SignInDialog
        open={openSignIn}
        onClose={() => setOpenSignIn(false)}
        reason="Sign in to see the fee breakdown and start your application."
        next={`/m/${service.slug}`}
      />
    </div>
  );
}

/** Renders one tab. `documents` and `acts` pull structured data off the service. */
function TabPanel({ tab, service }: { tab: ServiceTab; service: CatalogService }) {
  if (tab.id === "documents") {
    return (
      <div>
        <SectionHeading icon={FileText} title="Documents required" tint="accent" />
        {service.documents.length > 0 ? (
          <ul className="mt-4 sm:pl-[3.25rem] grid grid-cols-1 sm:grid-cols-2 gap-2">
            {service.documents.map((d, i) => (
              <li
                key={d}
                style={{ "--i": i } as React.CSSProperties}
                className="card-in flex items-start gap-2.5 text-sm rounded-lg border border-border/70 bg-panel/40 px-3 py-2.5 hover:border-success/50 hover:bg-success/[0.04] transition-colors"
              >
                <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
                <span className="text-foreground/85">{d}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No document checklist has been published for this service yet.</Empty>
        )}
      </div>
    );
  }

  if (tab.id === "acts") {
    const pdfs = service.actsRulesPdfs;
    return (
      <div>
        <SectionHeading icon={Gavel} title={tab.title} tint="amber" />
        {tab.content ? <Prose text={tab.content} /> : null}
        {pdfs.length > 0 && (
          <div className="mt-5 sm:pl-[3.25rem] space-y-2">
            <div className="label-eyebrow text-primary">Downloads</div>
            {pdfs.map((pdf, i) => (
              <a
                key={i}
                href={assetUrl(pdf.url)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm hover:border-primary/50 transition-colors"
              >
                <FileText className="size-4 text-primary shrink-0" />
                <span className="flex-1 truncate">{pdf.name}</span>
                <Download className="size-4 text-muted-foreground" />
              </a>
            ))}
          </div>
        )}
        {!tab.content && pdfs.length === 0 && (
          <Empty>No acts or rules have been published for this service yet.</Empty>
        )}
      </div>
    );
  }

  const Icon = TAB_ICONS[tab.id] ?? FileText;
  const tint = tab.id === "about" ? "primary" : tab.id === "who" ? "success" : "primary";
  const isJustified = tab.id === "about" || tab.id === "who";
  return (
    <div>
      <SectionHeading
        icon={Icon}
        title={tab.id === "about" ? "About this approval" : tab.title}
        tint={tint}
      />
      {tab.content ? <Prose text={tab.content} justify={isJustified} /> : <Empty>Nothing published here yet.</Empty>}
    </div>
  );
}

/**
 * Start Application → fee breakdown → summary → submit. Kept on the page rather
 * than in a modal so the customer can still read the tabs while deciding.
 */
function ApplicationPanel({
  service,
  fees,
  stage,
  setStage,
  onSubmit,
}: {
  service: CatalogService;
  fees: ReturnType<typeof resolveFees>;
  stage: "fees" | "summary";
  setStage: (s: "fees" | "summary" | null) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface shadow-elev overflow-hidden animate-in-up">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-gradient-to-r from-primary/10 via-accent/[0.06] to-transparent">
        <span className="size-9 rounded-xl gradient-brand text-white grid place-items-center shadow-brand">
          <Wallet className="size-4.5" />
        </span>
        <h2 className="text-sm font-semibold tracking-tight">
          {stage === "fees" ? "Fee breakdown" : "Application summary"}
        </h2>
        <button
          onClick={() => setStage(null)}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>

      {stage === "fees" ? (
        <div className="p-6">
          {fees.lines.length > 0 && fees.total > 0 ? (
            <>
              <ul className="space-y-1.5">
                {fees.lines.map((line, i) => (
                  <li
                    key={i}
                    style={{ "--i": i } as React.CSSProperties}
                    className="card-in flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm hover:bg-muted/60 transition-colors"
                  >
                    <span className="flex items-center gap-2.5 text-foreground/80">
                      <span className="size-1.5 rounded-full bg-primary/60" />
                      {line.label}
                    </span>
                    <span className="mono font-semibold">{inr(line.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between rounded-xl gradient-brand text-white px-4 py-3.5 shadow-brand animate-in-up">
                <span className="text-sm font-semibold">Total payable</span>
                <span className="mono text-lg font-bold tracking-tight">{inr(fees.total)}</span>
              </div>
            </>
          ) : (
            <Empty>
              Fees for this service haven't been published yet. A Cloudcrest BM advisor will share a
              quote after reviewing your application.
            </Empty>
          )}
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setStage("summary")}
              className="group flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all"
            >
              Continue to summary
              <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <SummaryRow label="Service" value={service.title} />
            <SummaryRow label="Authority" value={service.authority || "—"} />
            <SummaryRow label="Form" value={service.form || "—"} />
            <SummaryRow
              label="Total payable"
              value={fees.total > 0 ? inr(fees.total) : "Variable fee"}
              highlight
            />
          </dl>

          {service.documents.length > 0 && (
            <div className="mt-6">
              <div className="label-eyebrow text-primary mb-2">Documents to upload</div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {service.documents.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-[13px]">
                    <span className="mt-1.5 size-1.5 rounded-full bg-primary/60 shrink-0" />
                    <span className="text-foreground/80">{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => setStage("fees")}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="size-3.5" /> Back to fees
            </button>
            <button
              onClick={onSubmit}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all"
            >
              <Send className="size-4" /> Submit application
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border px-3.5 py-2.5 transition-colors " +
        (highlight
          ? "border-primary/30 bg-gradient-to-br from-primary/10 to-accent/[0.06]"
          : "border-border/70 bg-panel/40 hover:border-border")
      }
    >
      <dt className="label-eyebrow text-muted-foreground">{label}</dt>
      <dd className={"mt-0.5 font-semibold " + (highlight ? "text-primary" : "")}>{value}</dd>
    </div>
  );
}

const TINTS: Record<string, string> = {
  primary: "bg-primary/12 text-primary",
  success: "bg-success/14 text-success",
  accent: "bg-accent/14 text-accent",
  amber: "bg-warning/14 text-warning",
};

function SectionHeading({
  icon: Icon,
  title,
  tint = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tint?: keyof typeof TINTS | string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          "size-10 rounded-xl grid place-items-center shadow-card transition-transform hover:scale-105 " +
          (TINTS[tint] ?? TINTS.primary)
        }
      >
        <Icon className="size-5" />
      </span>
      <h2 className="text-lg font-display font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

/** Admin copy is plain text — preserve paragraph breaks and format bullet points cleanly. */
function Prose({ text, justify = false }: { text: string; justify?: boolean }) {
  const paragraphs = text.split(/\n{2,}/);

  return (
    <div
      className={
        "mt-4 pt-1 sm:pl-[3.25rem] space-y-3.5 text-sm leading-relaxed text-foreground/85 " +
        (justify ? "text-justify" : "")
      }
    >
      {paragraphs.map((para, i) => {
        const lines = para.split("\n").filter((l) => l.trim().length > 0);
        // Check if any line in this paragraph starts with a bullet symbol or number
        const hasBullets = lines.some((l) => /^[•\-\*]\s*|^\d+[\.\)]\s*/.test(l.trim()));

        if (hasBullets) {
          return (
            <div key={i} className="space-y-2 my-2">
              {lines.map((line, lineIdx) => {
                const match = line.trim().match(/^([•\-\*]|\d+[\.\)])\s*(.*)/);
                if (match) {
                  const [, bulletSymbol, bodyText] = match;
                  return (
                    <div key={lineIdx} className="flex items-start gap-2.5 my-1.5">
                      <span className="shrink-0 font-bold text-foreground select-none mt-0.5 min-w-[14px]">
                        {bulletSymbol === "-" || bulletSymbol === "*" ? "•" : bulletSymbol}
                      </span>
                      <span className={"flex-1 leading-relaxed " + (justify ? "text-justify" : "")}>
                        {bodyText}
                      </span>
                    </div>
                  );
                }
                return (
                  <p key={lineIdx} className={justify ? "text-justify" : ""}>
                    {line}
                  </p>
                );
              })}
            </div>
          );
        }

        return (
          <p key={i} className={"whitespace-pre-line " + (justify ? "text-justify" : "")}>
            {para}
          </p>
        );
      })}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 sm:pl-[3.25rem] text-sm text-muted-foreground italic">{children}</p>;
}

/** Frosted pill used in the service hero. */
function HeroChip({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-[12px] font-medium text-white/90 hover:bg-white/20 transition-colors">
      <Icon className="size-3.5 text-primary" />
      {children}
    </span>
  );
}
