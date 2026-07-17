import { getModule } from "@/lib/modules";
import { CompanyWizard } from "@/components/company-wizard";
import {
  FileText, ShieldCheck, Clock, Sparkles, ArrowRight,
} from "lucide-react";

export function ModulePage({ slug }: { slug: string }) {
  const m = getModule(slug);
  if (!m) {
    return (
      <div className="p-10">
        <h1 className="text-xl">Module not found</h1>
      </div>
    );
  }
  if (slug === "company") return <CompanyWizard />;
  return <GenericModule slug={slug} />;
}

function GenericModule({ slug }: { slug: string }) {
  const m = getModule(slug)!;
  const Icon = m.icon;
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-10 py-10 space-y-8">
        <div className="flex items-start justify-between gap-8">
          <div>
            <div className="label-eyebrow mb-2">
              {m.authority} · {m.form ?? "Registration Desk"}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {m.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-[62ch]">
              Guided workflow for {m.title.toLowerCase()} — validation, document
              checklist, dynamic fee estimate and downloadable summary.
            </p>
          </div>
          <div className="size-14 rounded-lg bg-panel border border-border grid place-items-center">
            <Icon className="size-6 text-brand" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { k: "Filing authority", v: m.authority, i: ShieldCheck },
            { k: "Primary form", v: m.form ?? "—", i: FileText },
            { k: "Typical TAT", v: "7 – 15 days", i: Clock },
          ].map((c) => (
            <div key={c.k} className="rounded-lg border border-border bg-panel p-4">
              <div className="flex items-center gap-2 label-eyebrow mb-2">
                <c.i className="size-3" />
                {c.k}
              </div>
              <div className="text-sm font-medium mono">{c.v}</div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-panel/40 p-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="size-4 text-brand" />
            <h2 className="text-sm font-semibold">Workflow Overview</h2>
          </div>
          <ol className="grid grid-cols-2 gap-x-8 gap-y-4">
            {[
              "Applicant profile & eligibility",
              "Document upload & verification",
              "Draft application preview",
              "Fee estimate & payment",
              "Regulatory filing",
              "Certificate download",
            ].map((s, i) => (
              <li key={s} className="flex items-start gap-3">
                <span className="mono text-[10px] text-brand mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm text-foreground/90">{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-6 pt-6 border-t border-border flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Backed by Cloudcrest BM compliance associates. Advisor call included
              in professional fee.
            </p>
            <button className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-brand-foreground text-xs font-semibold hover:bg-brand/90">
              Start {m.short} Application
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
