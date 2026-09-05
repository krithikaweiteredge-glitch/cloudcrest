import { useState } from "react";
import { ServiceDetail } from "@/components/service-detail-page";
import { useCatalogService } from "@/lib/service-catalog";
import { ArrowRight, Loader2, MapPin, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Generic state-wise registration flow, shared by every entity that is registered
 * per state the same way societies are (Partnership, Trust, HUF, Sole
 * Proprietorship — see the Society wizard for the original):
 *
 *   1. (optional) pick an entity sub-type,
 *   2. pick a state (Telangana / Andhra Pradesh / Karnataka),
 *   3. Start Application → the standard tabbed service page, with the chosen type
 *      and state carried onto the submitted request so the admin sees both.
 *
 * Every (type × state) — or (entity × state) when there is no type step —
 * combination has its OWN catalog row (slug `<type>-<state>` / `<base>-<state>`),
 * so pricing / who-can-apply / documents are authored per state by the admin. The
 * wizard resolves the combination row first and falls back to the type row and
 * then the base service so the page never renders empty before it is authored.
 */
export type StateWizardType = {
  key: string;
  /** Catalog slug prefix for this type; the state slug is appended to it. */
  slug: string;
  title: string;
  note?: string;
  icon: LucideIcon;
  recommended?: boolean;
};

export type EntityStateWizardConfig = {
  /** Fallback slug the page resolves to when no combination row is authored yet. */
  baseSlug: string;
  /** Title shown on the service page when there is no type step. */
  baseTitle: string;
  /** Key the chosen type is recorded under on the request (e.g. `partnershipType`). */
  typeFormDataKey?: string;
  /** Optional first step. Omit for a state-only flow (HUF / Trust / Proprietorship). */
  types?: StateWizardType[];
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    highlights: { icon: LucideIcon; label: string }[];
  };
  /** Copy for the type step (only used when `types` is provided). */
  typeStep?: { eyebrow: string; heading: string; subtitle: string };
  /** Copy for the state step. */
  stateStep?: { heading?: string; subtitle?: string };
  /** Label on the "back" control of the service page. */
  changeLabel?: string;
};

// Registration is handled state-wise, and every combination has its own catalog
// row (slug `<prefix>-<state>`). The slug here is the state half of that slug —
// kept in sync with REGISTRATION_STATES / SOCIETY_STATES in the backend seed.
export const REGISTRATION_STATES = [
  { name: "Telangana", slug: "telangana" },
  { name: "Andhra Pradesh", slug: "andhra-pradesh" },
  { name: "Karnataka", slug: "karnataka" },
];

export function EntityStateWizard({ config }: { config: EntityStateWizardConfig }) {
  const { types } = config;
  const hasTypes = !!types && types.length > 0;

  const [typeKey, setTypeKey] = useState<string | null>(null);
  const [stateSel, setStateSel] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const selectedType = hasTypes ? types!.find((t) => t.key === typeKey) ?? null : null;
  const stateSlug = REGISTRATION_STATES.find((s) => s.name === stateSel)?.slug ?? null;

  // Resolve the picked combination first — that row carries its own About / Who /
  // documents / fee. Fall back to the type row, then the base service, so the page
  // never renders empty if a combination isn't authored yet.
  const slugChain = (() => {
    if (hasTypes) {
      if (selectedType && stateSlug) return [`${selectedType.slug}-${stateSlug}`, selectedType.slug, config.baseSlug];
      if (selectedType) return [selectedType.slug, config.baseSlug];
      return [config.baseSlug];
    }
    if (stateSlug) return [`${config.baseSlug}-${stateSlug}`, config.baseSlug];
    return [config.baseSlug];
  })();
  const { service, loading } = useCatalogService(slugChain);

  const typeReady = !hasTypes || !!selectedType;
  const readyToStart = typeReady && !!stateSel;

  // Started → hand off to the standard tabbed service page (with the resolved
  // combination's own content) and the choices attached to the request. The loader
  // only gates this step, so the selection UI never flashes while a row resolves.
  if (started && readyToStart && stateSel) {
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
    const title = selectedType ? `${selectedType.title} — ${stateSel}` : `${config.baseTitle} — ${stateSel}`;
    const extraFormData: Record<string, unknown> = { state: stateSel };
    if (selectedType && config.typeFormDataKey) extraFormData[config.typeFormDataKey] = selectedType.title;
    return (
      <ServiceDetail
        service={{ ...service, title }}
        extraFormData={extraFormData}
        onBack={() => setStarted(false)}
        backLabel={config.changeLabel ?? "Change type"}
      />
    );
  }

  const stateStepNumber = hasTypes ? 2 : 1;

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
        <div className="relative px-10 py-10 max-w-5xl">
          <h1 className="text-4xl md:text-[42px] font-semibold font-display tracking-tight leading-[1.05]">
            {config.hero.title}
          </h1>
          <div className="mt-6 flex flex-wrap gap-2">
            {config.hero.highlights.map((h) => (
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

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-10 space-y-10">
        {/* Step 1 — type (only when the entity has sub-types) */}
        {hasTypes && config.typeStep && (
          <div>
            <div className="label-eyebrow mb-2 text-primary">{config.typeStep.eyebrow}</div>
            <h2 className="text-2xl font-semibold tracking-tight">{config.typeStep.heading}</h2>
            <p className="text-sm text-muted-foreground mt-1.5 text-justify">{config.typeStep.subtitle}</p>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
              {types!.map((t) => {
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
        )}

        {/* State step — appears after a type is chosen (or immediately for state-only flows) */}
        {typeReady && (
          <div className={hasTypes ? "animate-in-up" : undefined}>
            <div className="label-eyebrow mb-2 text-primary">Step {stateStepNumber} · State</div>
            <h2 className="text-2xl font-semibold tracking-tight">{config.stateStep?.heading ?? "Select your state"}</h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              {config.stateStep?.subtitle ?? "Registration is handled state-wise."}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {REGISTRATION_STATES.map((s) => {
                const active = stateSel === s.name;
                return (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => setStateSel(s.name)}
                    className={
                      "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all " +
                      (active
                        ? "border-primary bg-primary text-white shadow-brand"
                        : "border-border bg-surface text-foreground hover:border-primary/50 hover:bg-primary/[0.06]")
                    }
                  >
                    <MapPin className={"size-4 " + (active ? "text-white" : "text-primary")} />
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Start Application — appears once the selection is complete */}
        {readyToStart && (
          <div className="animate-in-up flex items-center justify-between gap-4 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] to-accent/[0.05] p-5">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{selectedType?.title ?? config.baseTitle}</div>
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
