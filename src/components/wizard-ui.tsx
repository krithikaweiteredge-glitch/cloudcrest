/**
 * Shared building blocks for the service wizards.
 *
 * MSME, NGO Darpan and the incorporation wizards each grew their own private
 * copies of these primitives. The four registration wizards added alongside them
 * (DIN, IEC, LEI, RERA) share this module instead, so the hero band, the fee
 * panel, the checklist and the form controls stay identical across them.
 */
import { ArrowLeft, ArrowRight, CheckCircle2, Download, FileText, Lock, Send } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Form controls                                                              */
/* -------------------------------------------------------------------------- */

export const fieldClass = (error?: string) =>
  "w-full bg-input border rounded-lg px-3 py-2.5 text-sm ring-focus transition-shadow " +
  (error ? "border-destructive focus:ring-destructive/25" : "border-border");

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface shadow-card p-6">{children}</div>;
}

export function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
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

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground/90 block">{label}</label>
      {children}
      {hint && !error && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
    </div>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  error,
  maxLength,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  maxLength?: number;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={fieldClass(error)}
    />
  );
}

export function DateInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass(error)} />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  error,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  rows?: number;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={fieldClass(error)}
    />
  );
}

export function Select({
  value,
  onChange,
  error,
  disabled,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={fieldClass(error) + (disabled ? " opacity-60 cursor-not-allowed" : "")}
    >
      {children}
    </select>
  );
}

/** A selectable option tile — radio groups in the source forms render as these. */
export function OptionCard({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
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

/** The explanatory note the source forms show under a dependent dropdown. */
export function NoteBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-lg border-l-[3px] border-accent bg-accent/8 px-3 py-2 text-[11px] leading-relaxed text-foreground/75">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page furniture                                                             */
/* -------------------------------------------------------------------------- */

export type Highlight = { icon: React.ComponentType<{ className?: string }>; label: string };

/** The gradient hero band every wizard opens with. */
export function WizardHero({
  eyebrow: _eyebrow,
  title,
  blurb: _blurb,
  highlights,
}: {
  eyebrow?: string;
  title: string;
  blurb?: string;
  highlights: Highlight[];
}) {
  return (
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
        <h1 className="text-4xl md:text-[42px] font-semibold font-display tracking-tight leading-[1.05]">
          {title}
        </h1>
        <div className="mt-6 flex flex-wrap gap-2">
          {highlights.map((h) => (
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
  );
}

/** Fee breakdown step, with the signed-out gate and the unpriced fallback. */
export function FeesStep({
  signedIn,
  onSignIn,
  loading,
  lines,
  total,
  heading,
  unpricedNote,
}: {
  signedIn: boolean;
  onSignIn: () => void;
  loading: boolean;
  lines: { label: string; amount: number }[];
  total: number;
  heading: string;
  unpricedNote: string;
}) {
  if (!signedIn) {
    return (
      <div className="rounded-xl border border-border bg-surface shadow-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Sign in to view fees</h3>
        </div>
        <p className="text-[13px] text-muted-foreground max-w-[60ch]">
          Fee estimates are available to signed-in customers. Sign in to see the breakdown, download
          the summary and submit your application.
        </p>
        <button
          onClick={onSignIn}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
        >
          Sign in to continue <ArrowRight className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">{heading}</h3>
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground py-4">Loading current pricing…</div>
      ) : total > 0 ? (
        <div className="space-y-2 text-xs">
          {lines.map((line) => (
            <div key={line.label} className="flex justify-between">
              <span className="text-muted-foreground">{line.label}</span>
              <span className="mono">₹ {line.amount.toLocaleString("en-IN")}</span>
            </div>
          ))}
          <div className="pt-3 border-t border-border flex justify-between items-baseline font-bold text-sm">
            <span>Total Estimated Cost</span>
            <span className="mono text-primary text-xl">₹ {total.toLocaleString("en-IN")}</span>
          </div>
        </div>
      ) : (
        <div className="text-[13px] text-muted-foreground">{unpricedNote}</div>
      )}
    </div>
  );
}

/** Back / Next — or Summary + Submit on the last step. */
export function WizardActions({
  step,
  stepCount,
  nextLabel,
  onBack,
  onNext,
  onDownload,
  onSubmit,
}: {
  step: number;
  stepCount: number;
  nextLabel?: string;
  onBack: () => void;
  onNext: () => void;
  onDownload: () => void;
  onSubmit: () => void;
}) {
  const isLast = step === stepCount - 1;
  return (
    <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
      <button
        onClick={onBack}
        disabled={step === 0}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-all cursor-pointer"
      >
        <ArrowLeft className="size-3.5" /> Back
      </button>
      <div className="flex items-center gap-2">
        {isLast ? (
          <>
            <button
              onClick={onDownload}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-muted transition-colors cursor-pointer"
            >
              <Download className="size-4" /> Summary
            </button>
            <button
              onClick={onSubmit}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
            >
              <Send className="size-4" /> Submit Application
            </button>
          </>
        ) : (
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all cursor-pointer"
          >
            Next · {nextLabel}
            <ArrowRight className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Right-hand rail: what is selected, the price, and what the applicant ends up
 * holding. Deliberately NOT the document checklist — that belongs in the upload
 * panel at submit, where the slots actually are, rather than as read-only text
 * the applicant has to scroll past on every step.
 */
export function WizardSidebar({
  selection,
  professionalFee,
  gstPercent,
  formNo,
  certificates,
}: {
  selection: { label: string; value: string }[];
  professionalFee: number;
  gstPercent: number;
  formNo?: string;
  certificates?: string[];
}) {
  return (
    <aside className="hidden lg:block w-80 border-l border-border bg-surface">
      <div className="sticky top-16 p-6">
        <div className="label-eyebrow mb-2.5 text-primary">Current Selection</div>
        <div className="rounded-lg border border-border bg-panel p-3.5 space-y-3">
          {selection.map((s) => (
            <div key={s.label}>
              <div className="text-[11px] text-muted-foreground font-medium">{s.label}</div>
              <div className="text-sm font-semibold text-foreground mt-0.5">{s.value || "Not selected"}</div>
            </div>
          ))}
          <div className="pt-2.5 border-t border-border/60">
            <div className="text-[11px] text-muted-foreground font-medium">Professional Fee</div>
            <div className="text-xs font-semibold mono text-primary mt-0.5">
              ₹{professionalFee.toLocaleString("en-IN")} + {gstPercent}% GST
            </div>
          </div>
          {formNo && (
            <div className="pt-2.5 border-t border-border/60 text-[10px] mono text-primary">
              Form · {formNo}
            </div>
          )}
        </div>

        {certificates && certificates.length > 0 && (
          <div className="mt-7">
            <div className="label-eyebrow mb-3">Registration Certificates</div>
            <ul className="space-y-2.5">
              {certificates.map((label) => (
                <li key={label} className="flex items-start gap-2 text-[12px]">
                  <CheckCircle2 className="size-3.5 text-success shrink-0 mt-0.5" />
                  <span className="text-foreground">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

export const EMAIL_RE = /^\S+@\S+\.\S+$/;
export const IN_MOBILE_RE = /^[6-9]\d{9}$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Normalise a stored phone (+91…, 91…) down to the bare 10 digits. */
export function format10DigitPhone(phoneStr?: string | null): string {
  if (!phoneStr) return "";
  let cleaned = phoneStr.trim();
  if (cleaned.startsWith("+91")) cleaned = cleaned.slice(3);
  else if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(2);
  cleaned = cleaned.replace(/\D/g, "");
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
}

/** POST the wizard's figures to the summary-PDF endpoint and save the file. */
export async function downloadSummaryPdf(
  body: Record<string, unknown>,
  filename: string,
): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/requests/summary/pdf`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to generate PDF summary");

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("PDF generation failed:", err);
    alert(err instanceof Error ? err.message : "Failed to download PDF summary");
  }
}

/** Prefill a wizard's contact fields from the signed-in user's profile. */
export async function fetchProfileContact(): Promise<{ email: string; phone: string } | null> {
  try {
    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/profiles/me`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.user) return null;
    return { email: data.user.email || "", phone: format10DigitPhone(data.user.phone) };
  } catch (err) {
    console.error("Error prefilling wizard profile:", err);
    return null;
  }
}
