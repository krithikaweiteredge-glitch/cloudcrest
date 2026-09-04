import { useState } from "react";
import { ServiceDetail } from "@/components/service-detail-page";
import { useCatalogService, useCatalogFamily } from "@/lib/service-catalog";
import { iconFor } from "@/lib/modules";
import { ArrowRight, Loader2, Landmark } from "lucide-react";

/**
 * An "Industry Specific" department landing page. The department is a catalog
 * service; its registrations are the inactive sibling services in the same
 * subcategory, surfaced via the family endpoint. Picking one opens that
 * registration's standard service page with a back link — the same pick-a-type
 * flow the GST and Partnership pages use, but driven entirely by the catalog.
 */
export function DepartmentPage({ slug }: { slug: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { service: dept, loading: deptLoading } = useCatalogService([slug]);
  const { variants, loading: famLoading } = useCatalogFamily(slug);
  const { service: subService, loading: subLoading } = useCatalogService(selected ? [selected] : []);

  // A registration is chosen → hand off to the standard tabbed service page.
  if (selected) {
    if (subLoading || !subService) {
      return (
        <div className="min-h-[60vh] grid place-items-center p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="size-8 text-primary animate-spin" />
            <button onClick={() => setSelected(null)} className="text-xs text-primary hover:underline">
              ← Back to {dept?.title ?? "department"}
            </button>
          </div>
        </div>
      );
    }
    return (
      <ServiceDetail
        service={subService}
        onBack={() => setSelected(null)}
        backLabel={`All ${dept?.title ?? "registrations"}`}
      />
    );
  }

  if (deptLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const list = variants ?? [];

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
          <h1 className="text-3xl md:text-[40px] font-semibold font-display tracking-tight leading-[1.06]">
            {dept?.title}
          </h1>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        <div className="mb-6">
          <div className="label-eyebrow mb-2 text-primary">Registrations</div>
          <h2 className="text-2xl font-semibold tracking-tight">Choose a registration</h2>
          <p className="text-sm text-muted-foreground mt-1.5">
            {list.length} {list.length === 1 ? "registration" : "registrations"} under {dept?.title}.
          </p>
        </div>

        {famLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl border border-border bg-surface animate-pulse" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No registrations have been published under this department yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((v) => {
              const Icon = iconFor(v.icon);
              return (
                <button
                  key={v.slug}
                  type="button"
                  onClick={() => setSelected(v.slug)}
                  className="group text-left p-5 rounded-xl bg-surface border border-border hover:border-primary/50 shadow-card hover-lift ring-focus transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="size-10 rounded-xl bg-primary/10 grid place-items-center text-primary group-hover:gradient-brand group-hover:text-white transition-all">
                      <Icon className="size-5" />
                    </span>
                    {v.formNo && v.formNo !== "—" && (
                      <span className="text-[10px] mono text-muted-foreground mt-1">{v.formNo}</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold leading-snug">{v.name}</div>
                  <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
                    View details
                    <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
