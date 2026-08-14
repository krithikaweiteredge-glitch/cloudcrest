import { useState } from "react";
import { ServiceDetail } from "@/components/service-detail-page";
import { useCatalogService } from "@/lib/service-catalog";
import { ArrowRight, Loader2, Building2, Users, MapPin, Check, ShieldCheck, ScrollText, ClipboardList, FileDown } from "lucide-react";

/**
 * Society registration flow (see "Registration flow for societies"):
 *   1. pick a society type (MACS / Co-operative Society),
 *   2. pick a state (Telangana / Andhra Pradesh / Karnataka),
 *   3. Start Application → the standard service page, with the chosen type and
 *      state carried onto the submitted request so the admin sees both.
 * Pricing / documents come from the `society` catalog service (admin-managed).
 */
const TYPES = [
  {
    key: "macs",
    slug: "society-macs",
    title: "Mutually Aided Cooperative Society",
    note: "Recommended for Flat Owners / Apartment Associations",
    icon: Building2,
    recommended: true,
  },
  {
    key: "coop",
    slug: "society-coop",
    title: "Co-operative Society",
    note: "For general co-operative societies.",
    icon: Users,
    recommended: false,
  },
];

const STATES = ["Telangana", "Andhra Pradesh", "Karnataka"];

export function SocietyWizard() {
  const [typeKey, setTypeKey] = useState<string | null>(null);
  const [stateSel, setStateSel] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const selectedType = TYPES.find((t) => t.key === typeKey) ?? null;
  // Resolve the chosen type's own catalog service (society-macs / society-coop)
  // so its admin-authored About / Who / documents / fee show, falling back to the
  // base `society` service until a type is picked.
  const { service, loading } = useCatalogService(
    selectedType ? [selectedType.slug, "society"] : ["society"],
  );

  // Started → hand off to the standard tabbed service page (with this type's own
  // About / Who / documents) and the choices attached to the request. The loader
  // only gates this step, so the selection UI never flashes while a type resolves.
  if (started && selectedType && stateSel) {
    if (loading || !service) {
      return (
        <div className="min-h-[60vh] grid place-items-center p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="size-8 text-primary animate-spin" />
            <button onClick={() => setStarted(false)} className="text-xs text-primary hover:underline">
              ← Back to selection
            </button>
          </div>
        </div>
      );
    }
    return (
      <ServiceDetail
        service={{ ...service, title: `${selectedType.title} — ${stateSel}` }}
        extraFormData={{ societyType: selectedType.title, state: stateSel }}
        onBack={() => setStarted(false)}
        backLabel="Change type / state"
      />
    );
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden gradient-hero text-white">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, oklch(0.7 0.19 45 / 0.4), transparent 40%), radial-gradient(circle at 80% 80%, oklch(0.6 0.18 240 / 0.5), transparent 45%)",
          }}
        />
        <div className="hero-grid" />
        <div className="relative px-6 md:px-10 py-12 max-w-5xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[11px] mono uppercase tracking-widest text-white/90">
            <span className="size-1.5 rounded-full bg-primary live-dot" /> Registrar of Societies
          </span>
          <h1 className="mt-4 text-4xl md:text-[42px] font-semibold font-display tracking-tight leading-[1.05]">
            Society Registration
          </h1>
          <p className="mt-3 text-white/70 max-w-2xl text-[15px] leading-relaxed">
            Choose the society type and your state. Each opens a full guide — who can apply, the documents you'll need and the fee — before you apply.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { icon: ShieldCheck, label: "Right Structure Guidance" },
              { icon: ScrollText, label: "Bye-laws & Documents" },
              { icon: ClipboardList, label: "Guided Application" },
              { icon: FileDown, label: "Tracked Submission" },
            ].map((h) => (
              <span key={h.label} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/12 border border-white/15 text-[12px] text-white/90">
                <h.icon className="size-3.5 text-primary" />
                {h.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-10 space-y-10">
        {/* Step 1 — society type */}
        <div>
          <div className="label-eyebrow mb-2 text-primary">Step 1 · Society type</div>
          <h2 className="text-2xl font-semibold tracking-tight">Choose a society type</h2>
          <p className="text-sm text-muted-foreground mt-1.5">Select the structure that fits your society.</p>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const active = typeKey === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTypeKey(t.key)}
                  className={
                    "group text-left p-5 rounded-xl border shadow-card ring-focus transition-all " +
                    (active
                      ? "border-primary bg-primary/[0.06] ring-2 ring-primary/30"
                      : "border-border bg-surface hover:border-primary/50 hover-lift")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={
                        "size-11 rounded-xl grid place-items-center transition-all " +
                        (active ? "gradient-brand text-white shadow-brand" : "bg-primary/10 text-primary group-hover:gradient-brand group-hover:text-white")
                      }
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="flex items-center gap-2">
                      {t.recommended && (
                        <span className="px-1.5 py-0.5 rounded-md bg-success/15 text-success text-[9px] mono uppercase tracking-wider">
                          Recommended
                        </span>
                      )}
                      {active && <Check className="size-4 text-primary" />}
                    </div>
                  </div>
                  <div className="mt-4 text-sm font-semibold leading-snug">{t.title}</div>
                  {t.note && <div className="mt-1 text-[12px] text-muted-foreground">{t.note}</div>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2 — state (appears after a type is chosen) */}
        {selectedType && (
          <div className="animate-in-up">
            <div className="label-eyebrow mb-2 text-primary">Step 2 · State</div>
            <h2 className="text-2xl font-semibold tracking-tight">Select your state</h2>
            <p className="text-sm text-muted-foreground mt-1.5">Society registration is handled state-wise.</p>

            <div className="mt-5 flex flex-wrap gap-2">
              {STATES.map((s) => {
                const active = stateSel === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStateSel(s)}
                    className={
                      "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all " +
                      (active
                        ? "border-primary bg-primary text-white shadow-brand"
                        : "border-border bg-surface text-foreground hover:border-primary/50 hover:bg-primary/[0.06]")
                    }
                  >
                    <MapPin className={"size-4 " + (active ? "text-white" : "text-primary")} />
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3 — Start Application (appears after a state is chosen) */}
        {selectedType && stateSel && (
          <div className="animate-in-up flex items-center justify-between gap-4 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] to-accent/[0.05] p-5">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{selectedType.title}</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">State: {stateSel}</div>
            </div>
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="group shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl gradient-brand text-white text-sm font-bold uppercase tracking-wide shadow-brand hover:shadow-elev hover:-translate-y-0.5 transition-all"
            >
              Next
              <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
