import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MODULE_GROUPS, ALL_MODULES } from "@/lib/modules";
import {
  Search, ArrowRight, ShieldCheck, Sparkles, Clock, Users, Star,
} from "lucide-react";
import logo from "@/assets/cloudcrest-logo.png";

const SUFFIXES = ["Private Limited", "LLP", "Foundation", "Producer Company"];

export function LandingHero() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(0);
  const [checking, setChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const suggestions = q.trim()
    ? SUFFIXES.map((s) => `${q.trim()} ${s}`)
    : [];

  const checkAndGo = async (finalName: string) => {
    if (checking || !finalName.trim()) return;
    setChecking(true);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/mca/name-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: finalName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to check name availability");
      }

      if (data.available) {
        // Direct redirect to company wizard with prefilled name!
        navigate({
          to: "/m/$slug",
          params: { slug: "company" },
          search: { name: finalName },
        });
      } else {
        setErrorMsg(data.reason || "This name is already registered or contains restricted terms.");
      }
    } catch (err: any) {
      console.error("Name check error:", err);
      setErrorMsg(err.message || "An error occurred while validating name.");
    } finally {
      setChecking(false);
    }
  };

  const filteredModules = q.trim()
    ? ALL_MODULES.filter((m) => m.title.toLowerCase().includes(q.toLowerCase())).slice(0, 4)
    : [];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden gradient-hero text-white">
        <div className="absolute inset-0 opacity-50 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 18%, oklch(0.58 0.22 27 / 0.45), transparent 42%), radial-gradient(circle at 88% 20%, oklch(0.62 0.16 152 / 0.45), transparent 45%), radial-gradient(circle at 50% 95%, oklch(0.55 0.20 255 / 0.55), transparent 50%)",
          }}
        />
        <div className="relative max-w-5xl mx-auto px-8 pt-14 pb-20 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-white/95 shadow-elev">
            <img src={logo} alt="Cloudcrest" className="h-7 w-auto object-contain" />
            <span className="text-[11px] mono uppercase tracking-widest text-muted-foreground">
              Business Management
            </span>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur text-[11px] mono uppercase tracking-widest text-white/90">
            <span className="size-1.5 rounded-full bg-destructive live-dot" />
            <span className="size-1.5 rounded-full bg-success" />
            <span className="size-1.5 rounded-full bg-primary" />
            India's compliance workspace · 22 registration modules
          </div>
          <h1 className="mt-6 text-4xl md:text-6xl font-display font-semibold tracking-tight leading-[1.02]">
            Start your business.<br />
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(90deg, oklch(0.58 0.22 27), oklch(0.62 0.16 152) 50%, oklch(0.65 0.20 255))" }}>
              Get it registered in days.
            </span>
          </h1>
          <p className="mt-5 text-white/70 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Search your company name, upload documents, and let Cloudcrest BM associates handle the
            filings — MCA, GST, MSME, Trademark and more.
          </p>

          {/* Search */}
          <div className="mt-9 mx-auto max-w-2xl">
            <form
              onSubmit={(e) => { e.preventDefault(); checkAndGo(`${q.trim()} ${SUFFIXES[pick]}`); }}
              className="flex items-stretch rounded-xl bg-white shadow-elev overflow-hidden ring-1 ring-white/20 focus-within:ring-primary/40 transition-shadow"
            >
              <div className="pl-4 pr-2 grid place-items-center">
                <Search className="size-5 text-muted-foreground" />
              </div>
              <input
                autoFocus
                disabled={checking}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Enter your business name — e.g. Acme Tech"
                className="flex-1 py-4 text-foreground text-base placeholder:text-muted-foreground bg-transparent focus:outline-none"
              />
              <select
                disabled={checking}
                value={pick}
                onChange={(e) => setPick(Number(e.target.value))}
                className="hidden md:block border-l border-border bg-white text-foreground text-sm px-3 focus:outline-none"
              >
                {SUFFIXES.map((s, i) => <option key={s} value={i}>{s}</option>)}
              </select>
              <button
                type="submit"
                disabled={checking}
                className="flex items-center gap-2 px-6 gradient-brand text-white font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50"
              >
                {checking ? "Checking..." : "Check & Start"} <ArrowRight className="size-4" />
              </button>
            </form>

            {errorMsg && (
              <div className="mt-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-left flex items-start gap-2.5">
                <span className="font-semibold shrink-0">Status:</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {(suggestions.length > 0 || filteredModules.length > 0) && (
              <div className="mt-3 rounded-xl bg-white text-foreground shadow-elev border border-border text-left overflow-hidden">
                {suggestions.length > 0 && (
                  <div>
                    <div className="label-eyebrow px-4 pt-3 pb-1">Name availability preview</div>
                    <ul>
                      {suggestions.map((s, i) => (
                        <li key={s}>
                          <button
                            onClick={() => checkAndGo(s)}
                            disabled={checking}
                            className="w-full text-left flex items-center justify-between px-4 py-2.5 hover:bg-muted transition-colors disabled:opacity-50"
                          >
                            <span className="text-sm">
                              <span className="font-semibold">{q.trim()}</span>{" "}
                              <span className="text-muted-foreground">{s.replace(q.trim(), "").trim()}</span>
                            </span>
                            <span className="text-[11px] mono text-success flex items-center gap-1">
                              <span className="size-1.5 rounded-full bg-success" /> Click to check
                            </span>
                          </button>
                          {i < suggestions.length - 1 && <div className="border-b border-border" />}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {filteredModules.length > 0 && (
                  <div className="border-t border-border">
                    <div className="label-eyebrow px-4 pt-3 pb-1">Matching services</div>
                    <ul className="pb-2">
                      {filteredModules.map((m) => {
                        const Icon = m.icon;
                        return (
                          <li key={m.slug}>
                            <button
                              onClick={() => navigate({ to: "/m/$slug", params: { slug: m.slug } })}
                              className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-muted transition-colors"
                            >
                              <Icon className="size-4 text-primary" />
                              <span className="text-sm flex-1">{m.title}</span>
                              <span className="text-[11px] mono text-muted-foreground">{m.authority}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Trust bar */}
          <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-3 text-[13px] text-white/80">
            <span className="flex items-center gap-2"><Users className="size-4 text-primary" /> 12,400+ businesses served</span>
            <span className="flex items-center gap-2"><Star className="size-4 text-primary" /> 4.8 / 5 client rating</span>
            <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> ISO 27001 · Secure filings</span>
            <span className="flex items-center gap-2"><Clock className="size-4 text-primary" /> Same-day advisor call</span>
          </div>
        </div>
      </section>

      {/* Services grid */}
      <section className="max-w-6xl mx-auto px-8 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="label-eyebrow text-primary mb-2">Services</div>
            <h2 className="text-3xl font-display font-semibold tracking-tight">
              Everything you need to run a compliant business
            </h2>
          </div>
        </div>

        <div className="space-y-10">
          {MODULE_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  {g.label}
                </h3>
                <span className="mono text-[10px] text-muted-foreground">
                  {g.items.length.toString().padStart(2, "0")} services
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.items.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.slug}
                      onClick={() => navigate({ to: "/m/$slug", params: { slug: m.slug } })}
                      className="group text-left rounded-xl border border-border bg-surface p-5 hover-lift shadow-card transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="size-10 rounded-lg bg-primary/10 grid place-items-center text-primary">
                          <Icon className="size-5" />
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <div className="mt-4 text-sm font-semibold">{m.title}</div>
                      <div className="text-[11px] mono text-muted-foreground mt-1">
                        {m.authority} · {m.form ?? "—"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Value strip */}
      <section className="bg-navy text-navy-foreground">
        <div className="max-w-6xl mx-auto px-8 py-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { i: ShieldCheck, t: "Backed by compliance experts", d: "Every filing is reviewed by CA/CS professionals before submission." },
            { i: Clock, t: "Transparent turnaround", d: "Track your application status in real time from application to certificate." },
            { i: Sparkles, t: "One dashboard for everything", d: "Manage 22+ registrations, renewals and post-approval compliance in a single place." },
          ].map((f) => (
            <div key={f.t} className="flex items-start gap-3">
              <div className="size-9 rounded-lg bg-white/10 grid place-items-center text-primary shrink-0">
                <f.i className="size-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">{f.t}</div>
                <div className="text-[13px] text-navy-foreground/70 mt-1">{f.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
