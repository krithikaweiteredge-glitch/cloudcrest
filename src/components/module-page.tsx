import { getModule, MODULE_GROUPS } from "@/lib/modules";
import { CompanyWizard } from "@/components/company-wizard";
import { Link } from "@tanstack/react-router";
import {
  FileText, ShieldCheck, Clock, ArrowRight, CheckCircle2,
  Sparkles, Phone,
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
  const group = MODULE_GROUPS.find((g) => g.items.some((i) => i.slug === slug))!;
  const siblings = group.items.filter((i) => i.slug !== slug).slice(0, 3);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden gradient-hero text-white">
        <div className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, oklch(0.7 0.19 45 / 0.45), transparent 40%), radial-gradient(circle at 85% 80%, oklch(0.6 0.18 240 / 0.5), transparent 45%)",
          }}
        />
        <div className="relative px-10 py-10 max-w-5xl">
          <div className="flex items-center gap-2 text-[11px] mono uppercase tracking-widest text-white/70">
            <span>{group.label}</span>
            <span className="text-white/30">/</span>
            <span className="text-primary">{m.short}</span>
          </div>
          <div className="mt-3 flex items-start gap-5">
            <div className="size-14 rounded-xl bg-white/10 border border-white/20 backdrop-blur grid place-items-center shrink-0">
              <Icon className="size-7 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl font-semibold font-display tracking-tight leading-[1.05]">
                {m.title}
              </h1>
              <p className="text-white/70 mt-2 text-[15px] max-w-2xl">
                Guided workflow for {m.title.toLowerCase()} — validation, document
                checklist, dynamic fee estimate and downloadable summary.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Chip label={`Authority · ${m.authority}`} />
            <Chip label={`Form · ${m.form ?? "—"}`} />
            <Chip label="TAT · 7–15 days" />
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="px-10 py-10 max-w-6xl mx-auto space-y-8 animate-in-up">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { k: "Filing authority", v: m.authority, i: ShieldCheck },
            { k: "Primary form", v: m.form ?? "—", i: FileText },
            { k: "Typical TAT", v: "7 – 15 days", i: Clock },
          ].map((c) => (
            <div key={c.k} className="rounded-xl border border-border bg-surface shadow-card p-5 hover-lift">
              <div className="flex items-center gap-2 label-eyebrow mb-2">
                <c.i className="size-3 text-primary" />
                {c.k}
              </div>
              <div className="text-lg font-semibold mono">{c.v}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl border border-border bg-surface shadow-card p-7">
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Workflow Overview</h2>
            </div>
            <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              {[
                "Applicant profile & eligibility",
                "Document upload & verification",
                "Draft application preview",
                "Fee estimate & payment",
                "Regulatory filing",
                "Certificate download",
              ].map((s, i) => (
                <li key={s} className="flex items-start gap-3 group">
                  <span className="size-6 rounded-md bg-primary/10 text-primary mono text-[10px] font-semibold grid place-items-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm text-foreground/85 pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 pt-6 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-[12px] text-muted-foreground">
                Backed by Cloudcrest BM compliance associates. Advisor call
                included in professional fee.
              </p>
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all self-start sm:self-auto">
                Start {m.short} Application <ArrowRight className="size-4" />
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface shadow-card p-6">
              <div className="label-eyebrow mb-3 text-primary">What's included</div>
              <ul className="space-y-2.5">
                {[
                  "End-to-end compliance filing",
                  "Real-time status tracking",
                  "Digital & physical certificates",
                  "Post-filing advisory (30 days)",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl gradient-hero text-white p-6 relative overflow-hidden">
              <div className="absolute -right-8 -bottom-8 size-32 rounded-full bg-primary/30 blur-3xl" />
              <div className="relative">
                <div className="label-eyebrow text-white/70 mb-2">Talk to advisor</div>
                <div className="mono text-lg font-semibold flex items-center gap-2">
                  <Phone className="size-4 text-primary" />
                  +91 89770 79433
                </div>
                <p className="text-white/60 text-[12px] mt-2 leading-relaxed">
                  Speak to a Cloudcrest BM associate for personalised guidance on{" "}
                  {m.short}.
                </p>
                <button className="mt-4 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-semibold transition-colors">
                  Book 15-min call
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="label-eyebrow">Also in {group.label}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {siblings.map((s) => {
              const SIcon = s.icon;
              return (
                <Link
                  key={s.slug}
                  to="/m/$slug"
                  params={{ slug: s.slug }}
                  className="group rounded-xl border border-border bg-surface p-4 hover-lift shadow-card flex items-center gap-3"
                >
                  <div className="size-9 rounded-lg bg-primary/10 grid place-items-center text-primary shrink-0">
                    <SIcon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{s.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate mono">
                      {s.authority} · {s.form ?? "—"}
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur text-[11px] mono text-white/90">
      {label}
    </span>
  );
}
