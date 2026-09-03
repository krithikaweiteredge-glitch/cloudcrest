import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCatalogGroups } from "@/lib/service-catalog";
import { useAuth } from "@/hooks/use-auth";
import { HeroBackdrop } from "@/components/hero-backdrop";
import { SignInDialog } from "@/components/sign-in-dialog";
import {
  Search, ArrowRight, ShieldCheck, Sparkles, Clock, Users, FileText, ChevronDown, CheckCircle2, AlertCircle,
} from "lucide-react";


// Backend origin — same convention as the rest of the app. Empty in local dev
// (Vite proxies /api); set to the backend URL in production. Using it here keeps
// the name check / similar-name calls pointed at the backend on the deployed
// site instead of the frontend's own domain (which 404s).
const BACKEND = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

const SUFFIXES = ["Private Limited", "LLP", "Limited"];
// Which registration wizard each suffix routes to once the name is available:
// Private Limited & Limited (public) → the Company wizard (it carries the
// private/public class internally); LLP → the LLP wizard.
const SUFFIX_SLUGS = ["company", "llp", "company"];

// Short, customer-facing one-liners per service. Keyed by slug; anything not
// listed falls back to a sensible template so new catalog services still read
// well.
const DESCRIPTIONS: Record<string, string> = {
  company: "Register your Private Limited Company end to end — from name approval to your incorporation certificate.",
  llp: "Set up your Limited Liability Partnership with drafting, DIN/DSC and all MCA filings handled for you.",
  partnership: "Register your Partnership Firm with a professionally drafted partnership deed and registration.",
  huf: "Create your Hindu Undivided Family entity with deed drafting and PAN, ready for tax benefits.",
  gst: "Get your GST registration and GSTIN filed and followed up by our experts, start to finish.",
  "pan-tan": "Apply for your business PAN and TAN together in a single, guided application flow.",
  msme: "Get your MSME / Udyam registration certificate quickly for subsidies, tenders and easy credit.",
  iec: "Get your Import-Export Code (IEC) from DGFT so your business can trade across borders.",
  dpiit: "Get recognised under Startup India (DPIIT) to unlock tax exemptions and funding benefits.",
  "labour-licence": "Obtain your CLRA labour licence with complete documentation and liaison support.",
  epf: "Register your business for Provident Fund (EPF) and stay compliant with EPFO from day one.",
  esi: "Register your business under ESI so your employees get medical and insurance benefits.",
  "shop-establishment": "Get your Shop & Establishment licence for your premises, handled with your local authority.",
  "trade-licence": "Get your municipal trade licence to operate your business legally and without penalties.",
  "fire-noc": "Obtain your Fire Department NOC for your premises with drawings and inspection support.",
  fssai: "Get your FSSAI food business licence — basic, state or central — filed correctly the first time.",
  "pollution-ncb": "Get your Pollution Control Board consent (NOC) to establish and operate compliantly.",
  "drug-licence": "Apply for your State FDA drug licence for retail or wholesale pharmacy operations.",
  trademark: "Protect your brand with a registered trademark, from search to filing across classes.",
  patent: "File and protect your invention with a drafted and filed patent application.",
  copyright: "Register copyright for your original creative, literary or software work.",
  design: "Register your industrial design to protect the unique look of your product.",
};

const describe = (slug: string, title: string, short: string) =>
  DESCRIPTIONS[slug] ?? `Register your ${short || title} with Cloudcrest's compliance experts, filed end to end.`;

export function LandingHero() {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated, loading: authLoading } = useAuth();
  // Same source as the sidebar, so an admin-published service shows up in both.
  const { groups, loading } = useCatalogGroups();
  const allModules = groups.flatMap((g) => g.items);
  // While the catalog loads, counts derived from it are 0 — show an em dash
  // instead of flashing "0" until the real numbers arrive.
  const count = (n: number) => (loading ? "—" : String(n));

  // Admins land on a service's registrations; customers on the service page.
  const openService = (slug: string) =>
    isAdmin
      ? navigate({ to: "/admin", search: { service: slug } })
      : navigate({ to: "/m/$slug", params: { slug } });
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(0);
  const [checking, setChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Shown briefly when a name is free, before routing to its registration wizard.
  const [okMsg, setOkMsg] = useState<string | null>(null);
  // Set when a signed-out visitor tries to check a name — prompts them to sign in.
  const [needAuth, setNeedAuth] = useState(false);
  type Company = {
    id?: number;
    name: string;
    domain?: string;
    industry?: string;
    location?: string;
    status?: string;
    companyStatus?: string;
    identifier?: string;
  };

  // Existing companies with the searched name, returned by the availability check.
  const [matches, setMatches] = useState<Company[]>([]);
  // Already-registered companies whose brand begins with what the user is typing,
  // fetched live from the MCA index so they can pick a distinctive name.
  const [similar, setSimilar] = useState<Company[]>([]);



  // Entity type each dropdown option filters the "similar" lookup by.
  const SUFFIX_TYPES = ["private", "llp", "public"];

  // Debounced lookup of similar existing names as the user types — scoped to the
  // entity type selected in the dropdown (Private Limited / LLP / Limited).
  useEffect(() => {
    // Editing the name (or switching entity type) invalidates the previous
    // check's result — clear it so a stale status message doesn't keep the
    // similar-names panel hidden.
    setErrorMsg(null);
    setOkMsg(null);
    setMatches([]);

    const term = q.trim();
    if (term.length < 2) {
      setSimilar([]);
      return;
    }
    const type = SUFFIX_TYPES[pick] ?? "private";
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${BACKEND}/api/mca/similar?q=${encodeURIComponent(term)}&type=${type}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const data = await res.json();
        setSimilar(Array.isArray(data.matches) ? data.matches : []);
      } catch {
        /* aborted or offline — ignore */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pick]);

  const checkAndGo = async (finalName: string, suffixIdx: number = pick) => {
    if (checking || !finalName.trim()) return;
    setChecking(true);
    setErrorMsg(null);
    setOkMsg(null);
    setNeedAuth(false);
    setMatches([]);

    try {
      const response = await fetch(`${BACKEND}/api/mca/name-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: finalName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to check name availability");
      }

      if (data.available) {
        const slug = SUFFIX_SLUGS[suffixIdx] ?? "company";
        const dest = slug === "llp" ? "LLP" : "Company";
        setSimilar([]);
        setOkMsg(`“${finalName}” is available for ${dest} registration!`);
      } else {
        setSimilar([]);
        setErrorMsg(data.reason || "This name is already registered or contains restricted terms.");
        setMatches(Array.isArray(data.matches) ? data.matches : []);
      }
    } catch (err: any) {
      console.error("Name check error:", err);
      setErrorMsg(err.message || "An error occurred while validating name.");
    } finally {
      setChecking(false);
    }
  };

  const resolveFinalName = (raw: string, suffixIdx: number = pick): string => {
    const trimmed = raw.trim();
    const suffix = SUFFIXES[suffixIdx] ?? "Private Limited";
    const hasSuffix = /\b(private limited|pvt\.?\s*ltd\.?|limited liability partnership|limited|ltd\.?|llp|one person company|\(opc\))\b/i.test(trimmed);
    return hasSuffix ? trimmed : `${trimmed} ${suffix}`;
  };

  const filteredModules = q.trim()
    ? allModules.filter((m) => m.title.toLowerCase().includes(q.toLowerCase())).slice(0, 4)
    : [];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden gradient-hero text-white">
        {/* Panning technical grid under the filing scene. */}
        <div className="hero-grid" />
        <HeroBackdrop />
        {/* Light scrim directly behind the copy only — strong enough to keep text
            readable, weak enough that the scene still reads through it. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 46% 34% at 50% 42%, oklch(0.21 0.05 258 / 0.55), transparent 72%)",
          }}
        />
        <div className="relative max-w-5xl mx-auto px-8 pt-14 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[11px] mono uppercase tracking-widest text-white/90">
            <span className="size-1.5 rounded-full bg-destructive live-dot" />
            <span className="size-1.5 rounded-full bg-success" />
            <span className="size-1.5 rounded-full bg-primary" />
            India's compliance workspace · {count(allModules.length)} registration modules
          </div>
          <h1 className="mt-7 text-5xl md:text-7xl lg:text-[5.5rem] font-display font-semibold tracking-[-0.03em] leading-[0.92]">
            Start your{" "}
            <span className="bg-clip-text text-transparent animated-gradient" style={{ backgroundImage: "linear-gradient(90deg, oklch(0.68 0.22 27), oklch(0.72 0.16 152) 50%, oklch(0.7 0.20 255), oklch(0.68 0.22 27))" }}>
              business registration
            </span>
          </h1>

          {/* Search */}
          <div className="mt-9 mx-auto w-full max-w-3xl px-2 sm:px-0">
            <form
              onSubmit={(e) => { e.preventDefault(); checkAndGo(resolveFinalName(q, pick)); }}
              className="relative flex flex-col sm:flex-row items-stretch rounded-2xl bg-white shadow-elev overflow-hidden ring-1 ring-white/20 focus-within:ring-2 focus-within:ring-primary/50 transition-all duration-300"
            >
              {/* Sweeping highlight — hidden once the field is in use. */}
              {!q && !checking && <span className="search-beam" />}
              
              <div className="relative pl-5 pr-2 grid place-items-center shrink-0">
                <Search className="size-5 text-muted-foreground" />
              </div>
              
              <input
                autoFocus
                disabled={checking}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Enter your business name — e.g. Acme Tech"
                className="relative flex-1 min-w-0 py-4 px-3 text-foreground text-sm sm:text-base placeholder:text-muted-foreground bg-transparent focus:outline-none"
              />

              <div className="relative flex items-center shrink-0 border-t sm:border-t-0 sm:border-l border-border/80 bg-slate-50/90 hover:bg-slate-100/90 transition-colors">
                <select
                  disabled={checking}
                  value={pick}
                  onChange={(e) => setPick(Number(e.target.value))}
                  className="appearance-none relative z-10 shrink-0 text-foreground font-semibold text-xs sm:text-sm pl-4 pr-9 py-4 cursor-pointer focus:outline-none bg-transparent"
                >
                  {SUFFIXES.map((s, i) => (
                    <option key={s} value={i} className="text-slate-900 bg-white font-medium py-2">
                      {s}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 size-4 text-slate-500 pointer-events-none z-20" />
              </div>
                <button
                  type="submit"
                  disabled={checking}
                  className="group relative flex shrink-0 items-center justify-center gap-2 px-5 sm:px-7 min-w-[7.5rem] sm:min-w-[10rem] gradient-brand text-white font-semibold text-sm whitespace-nowrap hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {checking ? (
                    <>
                      <span className="size-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      Checking…
                    </>
                  ) : (
                    <>
                      Check &amp; Next
                      <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
            </form>

            {okMsg && (
              <div className="mt-3 text-left">
                <div className="text-sm bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg backdrop-blur-md">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="size-5 text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-white">Name Available</div>
                      <div className="text-xs text-emerald-200 mt-0.5">{okMsg}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const slug = SUFFIX_SLUGS[pick] ?? "company";
                      navigate({ to: "/m/$slug", params: { slug } });
                    }}
                    className="shrink-0 text-xs font-semibold px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 font-sans"
                  >
                    Proceed to Registration
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="mt-3 text-left">
                <div className="text-sm bg-destructive/20 border border-rose-400/40 text-rose-100 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg backdrop-blur-md">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="size-5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-white">Name Restricted / Taken</div>
                      <div className="text-xs text-rose-200 mt-0.5">{errorMsg}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const slug = SUFFIX_SLUGS[pick] ?? "company";
                      navigate({ to: "/m/$slug", params: { slug } });
                    }}
                    className="shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-rose-500/30 hover:bg-rose-500/40 text-white border border-rose-400/40 transition-colors cursor-pointer"
                  >
                    Open {SUFFIX_SLUGS[pick] === "llp" ? "LLP" : "Company"} Wizard →
                  </button>
                </div>
                {matches.length > 0 && (
                  <div className="mt-2 rounded-xl bg-white text-foreground shadow-elev border border-border overflow-hidden">
                    <div className="label-eyebrow px-4 pt-3 pb-1">Existing companies with this name</div>
                    <ul className="pb-1">
                      {matches.map((m, i) => {
                        const statusText = m.companyStatus || m.status;
                        const isStrike = statusText?.toLowerCase().includes("strike") || statusText?.toLowerCase().includes("dissolved");
                        const isActive = statusText?.toLowerCase().includes("active");
                        return (
                          <li key={m.id ?? m.name + i} className="px-4 py-2.5 border-b border-border last:border-b-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold">{m.name}</div>
                              {statusText && (
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 border ${
                                    isStrike
                                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                      : isActive
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                      : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30"
                                  }`}
                                >
                                  {statusText}
                                </span>
                              )}
                            </div>
                            <div className="text-[12px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                              {m.identifier && <span className="font-mono font-medium text-primary">CIN: {m.identifier}</span>}
                              {(() => {
                                const cleanLoc = m.location && m.identifier
                                  ? m.location.replace(m.identifier, "").replace(/^[ ·-]+|[ ·-]+$/g, "").trim()
                                  : m.location;
                                return cleanLoc ? <span>{cleanLoc}</span> : null;
                              })()}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}


            {((similar.length > 0 && !errorMsg && !okMsg && !needAuth) || filteredModules.length > 0) && (
              <div className="mt-3 rounded-xl bg-white text-foreground shadow-elev border border-border text-left overflow-hidden">
                {similar.length > 0 && !errorMsg && !okMsg && !needAuth && (
                  <div>
                    <div className="label-eyebrow px-4 pt-3 pb-1">Similar existing companies</div>
                    <ul className="pb-1">
                      {similar.map((m, i) => {
                        const statusText = m.companyStatus || m.status;
                        const isStrike = statusText?.toLowerCase().includes("strike") || statusText?.toLowerCase().includes("dissolved");
                        const isActive = statusText?.toLowerCase().includes("active");
                        return (
                          <li key={(m.name ?? "") + i} className="px-4 py-2.5 border-b border-border last:border-b-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold">{m.name}</div>
                              {statusText && (
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 border ${
                                    isStrike
                                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                      : isActive
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                      : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30"
                                  }`}
                                >
                                  {statusText}
                                </span>
                              )}
                            </div>
                            <div className="text-[12px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                              {m.identifier && <span className="font-mono font-medium text-primary">CIN: {m.identifier}</span>}
                              {(() => {
                                const cleanLoc = m.location && m.identifier
                                  ? m.location.replace(m.identifier, "").replace(/^[ ·-]+|[ ·-]+$/g, "").trim()
                                  : m.location;
                                return cleanLoc ? <span>{cleanLoc}</span> : null;
                              })()}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {filteredModules.length > 0 && (
                  <div className={similar.length > 0 && !errorMsg && !okMsg && !needAuth ? "border-t border-border" : ""}>
                    <div className="label-eyebrow px-4 pt-3 pb-1">Matching services</div>
                    <ul className="pb-2">
                      {filteredModules.map((m) => {
                        const Icon = m.icon;
                        return (
                          <li key={m.slug}>
                            <button
                              onClick={() => openService(m.slug)}
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

          <p className="mt-6 text-white/70 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Search your name, upload documents once, and let Cloudcrest associates handle every
            filing — MCA, GST, MSME, Trademark and more.
          </p>

          {/* Oversized stat band */}
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-4 border-t border-white/10 pt-10">
            {[
              { n: "12,400+", l: "Businesses served" },
              { n: "4.8/5", l: "Client rating" },
              { n: loading ? "—" : `${allModules.length}+`, l: "Registration modules" },
              { n: "ISO 27001", l: "Secure filings" },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-3xl md:text-4xl font-display font-semibold tracking-tight">{s.n}</div>
                <div className="mt-1 text-[11px] mono uppercase tracking-widest text-white/50">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Kinetic marquee band */}
      <section className="bg-navy text-navy-foreground border-y border-white/5 overflow-hidden py-5">
        <div className="marquee-track flex w-max items-center gap-8 whitespace-nowrap">
          {Array.from({ length: 2 }).flatMap((_, dup) =>
            [
              "Company", "LLP", "GST", "MSME", "IEC", "Trademark", "Patent",
              "FSSAI", "EPF", "ESI", "Trade Licence", "Copyright", "Startup India",
            ].map((word) => (
              <span key={`${dup}-${word}`} className="flex items-center gap-8 text-2xl md:text-3xl font-display font-medium tracking-tight">
                <span className="text-navy-foreground/80 hover:text-primary transition-colors">{word}</span>
                <span className="text-primary/60 text-lg">✦</span>
              </span>
            )),
          )}
        </div>
      </section>

      {/* Services grid — cards float on a slowly flowing blue glow. */}
      <section className="relative pt-8 md:pt-10 pb-20 md:pb-28">
        <div className="cards-blue-glow">
          <span className="cloud-1" />
          <span className="cloud-2" />
          <span className="cloud-3" />
          <span className="cloud-4" />
          <span className="cards-sheen" />
        </div>
        <div className="relative z-[1] max-w-[1600px] mx-auto px-6 md:px-12">
        <div className="flex items-end justify-between gap-6 mb-12 border-b border-border pb-8">
          <div>
            <div className="label-eyebrow text-primary mb-2">Services</div>
            <h2 className="text-3xl md:text-5xl font-display font-semibold tracking-[-0.02em] leading-[1.02] max-w-xl">
              Everything you need to run a{" "}
              <span className="italic font-normal">compliant</span> business
            </h2>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {[
                { i: ShieldCheck, t: "CA Verified", c: "text-primary" },
                { i: Users, t: "Expert Advisors", c: "text-success" },
                { i: Clock, t: "Timely Delivery", c: "text-[#7c3aed]" },
              ].map((b) => (
                <div
                  key={b.t}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-foreground shadow-sm"
                >
                  <b.i className={"size-4 " + b.c} />
                  {b.t}
                </div>
              ))}
            </div>
          </div>
          <span className="hidden md:block mono text-[11px] text-muted-foreground whitespace-nowrap pb-1">
            {count(allModules.length)} services
          </span>
        </div>

        <div className="space-y-10">
          {loading
            ? Array.from({ length: 2 }).map((_, gi) => (
                <div key={gi}>
                  <div className="mb-4 h-4 w-40 rounded bg-muted-foreground/15 animate-pulse" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
                    {Array.from({ length: 6 }).map((_, ci) => (
                      <div
                        key={ci}
                        className="min-h-[14.5rem] border border-border bg-surface p-6 animate-pulse"
                      >
                        <div className="size-11 rounded-xl bg-muted-foreground/15" />
                        <div className="mt-5 h-4 w-2/3 rounded bg-muted-foreground/15" />
                        <div className="mt-3 h-3 w-full rounded bg-muted-foreground/10" />
                        <div className="mt-2 h-3 w-5/6 rounded bg-muted-foreground/10" />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            : groups.map((g) => (
            <div key={g.label}>
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">
                  {g.label}
                </h3>
                <span className="mono text-[10px] text-muted-foreground">
                  {g.items.length.toString().padStart(2, "0")} services
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
                {g.items.map((m, ci) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.slug}
                      onClick={() => openService(m.slug)}
                      style={{ "--i": ci } as React.CSSProperties}
                      className="card-in group relative flex flex-col min-h-[14.5rem] overflow-hidden text-left border border-border bg-surface p-6 shadow-[0_4px_10px_-2px_oklch(0.2_0.04_260_/_0.1),0_18px_44px_-12px_oklch(0.2_0.04_260_/_0.18)] transition-all duration-300 hover:-translate-y-1.5 hover:border-primary hover:bg-navy hover:shadow-[0_28px_64px_-14px_oklch(0.24_0.08_260_/_0.75)]"
                    >
                      {/* Soft highlight that blooms on hover over the dark fill. */}
                      <span
                        className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{
                          background:
                            "radial-gradient(120% 90% at 0% 0%, oklch(0.55 0.20 255 / 0.4), transparent 55%)",
                        }}
                      />
                      <div className="relative flex items-start justify-between gap-3">
                        <div className="size-11 rounded-xl bg-primary/10 grid place-items-center text-primary transition-all duration-300 group-hover:gradient-brand group-hover:text-white group-hover:shadow-brand group-hover:scale-110">
                          <Icon className="size-5" />
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground transition-all duration-300 group-hover:text-white group-hover:translate-x-0.5" />
                      </div>
                      <div className="relative mt-5 text-[15px] font-display font-semibold tracking-[-0.01em] text-foreground transition-colors duration-300 group-hover:text-white">
                        {m.title}
                      </div>
                      <div className="relative flex-1 mt-2 text-[13px] font-sans leading-relaxed text-muted-foreground transition-colors duration-300 group-hover:text-white/75">
                        {describe(m.slug, m.title, m.short)}
                      </div>
                      {/* Turnaround + document count — admin-managed. Each chip
                          shows only when its value is set (no hardcoded fallback). */}
                      {(m.timelineDays || m.documentsCount != null) && (
                        <div className="relative mt-3 flex flex-wrap items-center gap-2">
                          {m.timelineDays && (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors duration-300 group-hover:border-white/15 group-hover:bg-white/10 group-hover:text-white/70">
                              <Clock className="size-3.5" /> {m.timelineDays}
                            </span>
                          )}
                          {m.documentsCount != null && (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors duration-300 group-hover:border-white/15 group-hover:bg-white/10 group-hover:text-white/70">
                              <FileText className="size-3.5" /> {m.documentsCount} Documents
                            </span>
                          )}
                        </div>
                      )}

                      {/* Start Application CTA — slides up into view on hover. */}
                      <div className="relative grid transition-all duration-300 grid-rows-[0fr] opacity-0 group-hover:grid-rows-[1fr] group-hover:opacity-100 group-hover:mt-4">
                        <div className="overflow-hidden">
                          <span className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg gradient-brand text-white text-xs font-semibold shadow-brand">
                            Start Application <ArrowRight className="size-3.5" />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* Value strip */}
      <section className="bg-navy text-navy-foreground">
        <div className="max-w-6xl mx-auto px-8 py-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { i: ShieldCheck, t: "Backed by compliance experts", d: "Every filing is reviewed by CA/CS professionals before submission." },
            { i: Clock, t: "Transparent turnaround", d: "Track your application status in real time from application to certificate." },
            { i: Sparkles, t: "One dashboard for everything", d: `Manage ${loading ? "all your" : `${allModules.length}+`} registrations, renewals and post-approval compliance in a single place.` },
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

      {/* Sign-in required before starting a registration from the search. */}
      <SignInDialog
        open={needAuth}
        onClose={() => setNeedAuth(false)}
        reason="Please sign in to check your business name and start your registration."
        next="/"
      />
    </div>
  );
}
