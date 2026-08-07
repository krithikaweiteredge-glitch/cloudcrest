import { useMemo, useState } from "react";
import { ServiceDetail } from "@/components/service-detail-page";
import { useCatalogService, type CatalogService } from "@/lib/service-catalog";
import { ArrowRight } from "lucide-react";

/**
 * A registration "type" — a variant of a service that has its own About / Who
 * can apply / Documents content but shares the parent service's pricing and
 * Acts & Rules (e.g. the GST registration categories, or Registered vs
 * Unregistered partnership firm).
 */
export type RegistrationType = {
  key: string;
  title: string;
  short: string;
  /** Filing form / instrument shown on the card and detail page. */
  form: string;
  tags: string[];
  popular?: boolean;
  /** One-line description on the picker card. */
  blurb: string;
  /** "About this registration" copy. */
  about: string;
  /** "Who can apply" bullets. */
  who: string[];
  /** Documents required. */
  docs: string[];
};

type HeroHighlight = { icon: React.ComponentType<{ className?: string }>; label: string };

/** Bullet list rendered as plain text for the "Who can Apply" tab. */
const bulletsToText = (items: string[]) => items.map((i) => `• ${i}`).join("\n");

/**
 * Shared "pick a type, then see the full service page" flow. The applicant picks
 * a variant from the cards; selecting one opens the standard tabbed service page
 * (About / Who can apply / Documents / Acts & Rules + Start Application) built
 * for that variant, layered over the catalog `catalogSlug` service for pricing
 * and acts. The chosen variant's title is written onto the request under
 * `formDataKey`, so the customer and admin both see which type was applied for.
 */
export function TypePickerPage({
  catalogSlug,
  titlePrefix,
  formDataKey,
  backLabel,
  hero,
  picker,
  types,
}: {
  catalogSlug: string;
  /** Prefix for the detail-page title, e.g. "GST Registration — ". */
  titlePrefix: string;
  /** formData key the chosen type's title is stored under, e.g. "gstType". */
  formDataKey: string;
  /** Back-link label shown on the detail page hero. */
  backLabel: string;
  hero: { badge: string; title: string; subtitle: string; highlights: HeroHighlight[] };
  picker: { eyebrow: string; heading: string; subtitle: string };
  types: RegistrationType[];
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const variantSlugs = useMemo(
    () => (selectedKey ? [`${catalogSlug}-${selectedKey}`, catalogSlug] : [catalogSlug]),
    [catalogSlug, selectedKey]
  );
  const { service: catalog } = useCatalogService(variantSlugs);

  const selected = selectedKey ? types.find((t) => t.key === selectedKey) ?? null : null;

  const typeService: CatalogService | null = useMemo(() => {
    if (!selected) return null;
    const targetSlug = `${catalogSlug}-${selected.key}`;
    const isVariantLoaded = catalog?.slug === targetSlug;
    const vCat = isVariantLoaded ? catalog : null;

    const defaultWhoText = bulletsToText(selected.who);
    const descText = vCat?.description?.trim() ? vCat.description : selected.about;
    const whoText = vCat?.whoCanApply?.trim() ? vCat.whoCanApply : defaultWhoText;
    const docs = vCat?.documents && vCat.documents.length > 0 ? vCat.documents : selected.docs;

    const defaultTabs = [
      { id: "about", title: "About", content: descText, visible: true },
      { id: "who", title: "Who can Apply", content: whoText, visible: true },
      { id: "documents", title: "Documents", content: "", visible: true },
      { id: "acts", title: "Acts and Rules", content: vCat?.actsRules || catalog?.actsRules || "", visible: true },
    ];

    const tabs =
      vCat?.tabs && vCat.tabs.length > 0
        ? vCat.tabs.map((t) => {
            if (t.id === "about" && !t.content?.trim()) return { ...t, content: descText };
            if (t.id === "who" && !t.content?.trim()) return { ...t, content: whoText };
            if (t.id === "acts" && !t.content?.trim()) return { ...t, content: catalog?.actsRules || "" };
            return t;
          })
        : defaultTabs;

    return {
      slug: vCat?.slug || targetSlug,
      title: `${titlePrefix}${selected.title}`,
      short: vCat?.short || selected.short,
      authority: vCat?.authority || catalog?.authority || "",
      form: vCat?.form || selected.form,
      description: descText,
      whoCanApply: whoText,
      actsRules: vCat?.actsRules || catalog?.actsRules || "",
      tabs,
      actsRulesPdfs: vCat?.actsRulesPdfs || catalog?.actsRulesPdfs || [],
      feeLines: vCat?.feeLines || catalog?.feeLines || [],
      documents: docs,
      professionalFee: vCat?.professionalFee ?? catalog?.professionalFee,
      govtFee: vCat?.govtFee ?? catalog?.govtFee,
      gstPercent: vCat?.gstPercent ?? catalog?.gstPercent ?? 18,
    };
  }, [selected, catalog, catalogSlug, titlePrefix]);

  // Once a type is chosen, hand off to the standard tabbed service page.
  if (selected && typeService) {
    return (
      <ServiceDetail
        service={typeService}
        extraFormData={{ [formDataKey]: selected.title }}
        onBack={() => setSelectedKey(null)}
        backLabel={backLabel}
      />
    );
  }

  // Type picker.
  return (
    <div>
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
            <span className="size-1.5 rounded-full bg-primary live-dot" />
            {hero.badge}
          </span>
          <h1 className="mt-4 text-4xl md:text-[42px] font-semibold font-display tracking-tight leading-[1.05]">
            {hero.title}
          </h1>
          <p className="mt-3 text-white/70 max-w-2xl text-[15px] leading-relaxed">{hero.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {hero.highlights.map((h) => (
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

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        <div className="mb-6">
          <div className="label-eyebrow mb-2 text-primary">{picker.eyebrow}</div>
          <h2 className="text-2xl font-semibold tracking-tight">{picker.heading}</h2>
          <p className="text-sm text-muted-foreground mt-1.5">{picker.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {types.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSelectedKey(t.key)}
              className="group text-left p-5 rounded-xl bg-surface border border-border hover:border-primary/50 shadow-card hover-lift ring-focus transition-all"
            >
              <div className="mb-3">
                <div className="text-sm font-semibold leading-tight">{t.title}</div>
                <div className="text-[10px] mono text-muted-foreground mt-1">{t.form}</div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {t.popular && (
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
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
                View details
                <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
