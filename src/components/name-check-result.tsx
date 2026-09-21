import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Ban,
  Building2,
  CheckCircle2,
  Copy,
  Handshake,
  Info,
  X,
} from "lucide-react";

/**
 * The home-page name check's result box: verdict, the matched company's
 * details, a risk level and an approval-confidence estimate, and — when the
 * name is clear — "Proceed with this name", which asks Company or LLP (unless
 * the structure filter already says which) and opens that registration wizard
 * with the name filled in.
 *
 * Risk and confidence are NOT from an AI model. They are derived from what the
 * MCA registry lookup actually returned (see `assessName`), and the box says so.
 */

/** A registry row, as `/api/mca/name-check` and `/api/mca/similar` return it. */
export type CompanyMatch = {
  id?: number;
  name: string;
  domain?: string;
  industry?: string;
  location?: string;
  status?: string;
  companyStatus?: string;
  identifier?: string;
  /** "Private Limited Company" | "Public Limited Company" | "LLP" | "Company" | … */
  entityType?: string;
  source?: string;
};

/** What the availability check came back with, plus the name it was run on. */
export type NameCheck = {
  name: string;
  available: boolean;
  reason?: string;
  matches: CompanyMatch[];
  source?: string;
};

/* ------------------------------------------------------------------ *
 * Structure filter
 * ------------------------------------------------------------------ */

export type StructureFilter = "all" | "pvt" | "public" | "opc" | "llp";

export const STRUCTURE_FILTERS: { key: StructureFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pvt", label: "Private Limited" },
  { key: "public", label: "Public Limited" },
  { key: "opc", label: "OPC" },
  { key: "llp", label: "LLP" },
];

const isOpcName = (name: string) => /\bOPC\b|ONE\s+PERSON/i.test(name);

/**
 * Does a registry row belong to the chosen structure? The index labels rows
 * "Private Limited Company" / "Public Limited Company" / "LLP", and struck-off
 * rows only "Company" / "LLP". OPCs are private companies, recognisable only by
 * the "(OPC)" in their name. A struck-off "Company" can't be placed more
 * precisely, so it stays under every company filter rather than being hidden.
 */
export function matchesStructure(m: CompanyMatch, filter: StructureFilter): boolean {
  if (filter === "all") return true;
  const t = (m.entityType || "").toLowerCase();
  const llp = t.includes("llp") || t.includes("partnership");
  if (filter === "llp") return llp;
  if (llp) return false;
  const bareCompany = t === "company" || t === "";
  if (filter === "public") return bareCompany || t.includes("public");
  if (filter === "opc") return bareCompany || isOpcName(m.name);
  // Private Limited: private companies that aren't OPCs.
  return bareCompany || (t.includes("private") && !isOpcName(m.name));
}

/* ------------------------------------------------------------------ *
 * Risk & confidence
 * ------------------------------------------------------------------ */

export type Risk = "Low" | "Medium" | "High";

export type Assessment = {
  risk: Risk;
  /** Rough likelihood (0–100) that the MCA approves the name as searched. */
  confidence: number;
  /** One line on why, shown under the rings. */
  note: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const LEGAL_TAIL =
  /\b(private|pvt|public|limited|ltd|llp|opc|company|co|liability|partnership|one|person)\b/gi;
const firstWord = (s: string) =>
  s
    .replace(LEGAL_TAIL, " ")
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)[0] ?? "";

/**
 * Turn the registry lookup into a risk level and an approval-confidence
 * estimate. The inputs are facts — an exact or brand match in the active
 * register, a struck-off match, a restricted word, or how many registered names
 * share the searched name's leading word — and the numbers are a fixed mapping
 * of those facts, not a model's opinion:
 *
 *   restricted word (India, Bank, Govt …)   High    15%
 *   struck-off company with this brand      High    10%
 *   registered company with this brand      High    10%  (5% if identical)
 *   clear, but names share its first word   Medium  80% − 5% each, floor 50%
 *   clear, nothing close                    Low     92%
 */
export function assessName(check: NameCheck, similar: CompanyMatch[]): Assessment {
  if (!check.available) {
    const reason = check.reason || "";
    if (/restricted keyword/i.test(reason)) {
      return {
        risk: "High",
        confidence: 15,
        note: "The name uses a word that needs Central Government approval before the MCA will accept it.",
      };
    }
    if (check.source === "mca-struck-off") {
      return {
        risk: "High",
        confidence: 10,
        note: "A struck-off company holds this name. It can be restored within 20 years, so the name stays blocked.",
      };
    }
    const identical = check.matches.some((m) => norm(m.name) === norm(check.name));
    return {
      risk: "High",
      confidence: identical ? 5 : 10,
      note: identical
        ? "A company with exactly this name is already registered."
        : "A registered company already uses this brand name — the MCA rejects identical or deceptively similar names.",
    };
  }

  const head = firstWord(check.name);
  const close = head ? similar.filter((m) => norm(firstWord(m.name)) === norm(head)).length : 0;
  if (close > 0) {
    return {
      risk: "Medium",
      confidence: Math.max(50, 80 - close * 5),
      note: `No exact match, but ${close} registered name${close === 1 ? "" : "s"} start${close === 1 ? "s" : ""} with “${head}”. The MCA may treat the name as too similar — adding a distinctive word helps.`,
    };
  }
  return {
    risk: "Low",
    confidence: 92,
    note: "No registered company, LLP or struck-off entity uses this name or anything close to it.",
  };
}

/* ------------------------------------------------------------------ *
 * Company details
 * ------------------------------------------------------------------ */

/** The state/UT code a CIN carries at positions 7–8 (L85110KA1981PLC013115 → KA). */
const CIN_STATES: Record<string, string> = {
  AN: "Andaman & Nicobar",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CH: "Chandigarh",
  CT: "Chhattisgarh",
  CG: "Chhattisgarh",
  DD: "Daman & Diu",
  DL: "Delhi",
  DN: "Dadra & Nagar Haveli",
  GA: "Goa",
  GJ: "Gujarat",
  HP: "Himachal Pradesh",
  HR: "Haryana",
  JH: "Jharkhand",
  JK: "Jammu & Kashmir",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MH: "Maharashtra",
  ML: "Meghalaya",
  MN: "Manipur",
  MP: "Madhya Pradesh",
  MZ: "Mizoram",
  NL: "Nagaland",
  OD: "Odisha",
  OR: "Odisha",
  PB: "Punjab",
  PY: "Puducherry",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TG: "Telangana",
  TS: "Telangana",
  TN: "Tamil Nadu",
  TR: "Tripura",
  UK: "Uttarakhand",
  UR: "Uttarakhand",
  UP: "Uttar Pradesh",
  WB: "West Bengal",
};

const CIN_RE = /^[LU]\d{5}([A-Z]{2})(\d{4})[A-Z]{3}\d{6}$/;

function stateFromCin(cin?: string): string | undefined {
  const m = cin?.toUpperCase().match(CIN_RE);
  return m ? CIN_STATES[m[1]] : undefined;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const fmtDate = (d?: string | null) => {
  if (!d) return undefined;
  if (ISO_DATE.test(d)) {
    const [y, m, day] = d.split("-");
    return `${day}-${m}-${y}`;
  }
  return d;
};

/** The richer record `/api/mca/company-details` returns for a CIN / LLPIN. */
type CompanyDetails = {
  cin?: string;
  name?: string;
  entityType?: string;
  incorporationDate?: string | null;
  state?: string;
  roc?: string;
  address?: string;
  companyStatus?: string;
  status?: string;
};

/**
 * Enrich the top match with its full registry record — state, RoC, address —
 * when the backend can find it. Silent on failure: the row we already have is
 * shown either way.
 */
function useCompanyDetails(backend: string, cin?: string) {
  const [details, setDetails] = useState<CompanyDetails | null>(null);
  useEffect(() => {
    setDetails(null);
    if (!cin) return;
    const ctrl = new AbortController();
    fetch(`${backend}/api/mca/company-details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cin }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.found && d.company) setDetails(d.company);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [backend, cin]);
  return details;
}

/* ------------------------------------------------------------------ *
 * Rings
 * ------------------------------------------------------------------ */

const RISK_STYLE: Record<Risk, { color: string; fill: number; text: string }> = {
  High: { color: "var(--destructive)", fill: 0.85, text: "text-destructive" },
  Medium: { color: "oklch(0.75 0.16 70)", fill: 0.55, text: "text-amber-600" },
  Low: { color: "var(--success)", fill: 0.25, text: "text-success" },
};

function Ring({
  fraction,
  color,
  children,
}: {
  fraction: number;
  color: string;
  children: React.ReactNode;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-36">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 900ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The box
 * ------------------------------------------------------------------ */

const STEP_LABELS = [
  "Normalising the name…",
  "Checking restricted words…",
  "Matching against active companies & LLPs…",
  "Checking struck-off entities…",
  "Scoring similarity…",
];

/** Shown while the check runs — the steps are the ones the backend really performs. */
export function NameCheckProgress({ name }: { name: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, STEP_LABELS.length - 1)), 650);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="mt-4 rounded-2xl bg-white text-foreground shadow-elev border border-border p-6 text-left">
      <div className="flex justify-center">
        <span className="size-9 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
      </div>
      <div className="mt-4 text-sm font-semibold text-primary">Checking name availability</div>
      <div className="mt-1 text-sm text-foreground/80">{STEP_LABELS[i]}</div>
      <div className="mt-1 text-xs italic text-muted-foreground">“{name}”</div>
      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full gradient-brand transition-all duration-500"
          style={{ width: `${((i + 1) / STEP_LABELS.length) * 100}%` }}
        />
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">
        Step {i + 1} of {STEP_LABELS.length}
      </div>
    </div>
  );
}

export function NameCheckResult({
  check,
  similar,
  filter,
  backend,
  onProceed,
  onClose,
}: {
  check: NameCheck;
  similar: CompanyMatch[];
  filter: StructureFilter;
  backend: string;
  /** Opens the registration wizard for the chosen structure with this name. */
  onProceed: (structure: Exclude<StructureFilter, "all">) => void;
  onClose: () => void;
}) {
  const assessment = assessName(check, similar);
  const risk = RISK_STYLE[assessment.risk];
  const top = check.matches[0];
  const details = useCompanyDetails(backend, top?.identifier);
  const [choosing, setChoosing] = useState(false);
  const [copied, setCopied] = useState(false);

  const proceed = () => {
    if (filter === "all") setChoosing(true);
    else onProceed(filter);
  };

  const cin = details?.cin || top?.identifier;
  const status = details?.companyStatus || top?.companyStatus || top?.status;
  const struck = /strike|dissolved/i.test(status || "");
  const incorporated =
    fmtDate(details?.incorporationDate) ||
    (top?.location && ISO_DATE.test(top.location) ? fmtDate(top.location) : undefined);
  // data.gov.in spells the state in lower case ("karnataka") and the class as a
  // bare "Public" / "Private", so tidy both before they reach the box.
  const titleCase = (v: string) => v.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const govState =
    details?.state && details.state.length > 2 ? titleCase(details.state) : undefined;
  const stateRoc = [govState || stateFromCin(cin), details?.roc && titleCase(details.roc)]
    .filter(Boolean)
    .join(" · ");
  const typeLabel =
    details?.entityType && details.entityType.split(/\s+/).length > 1
      ? details.entityType
      : top?.entityType || details?.entityType;

  return (
    <div className="mt-4 rounded-2xl bg-white text-foreground shadow-elev border border-border text-left overflow-hidden animate-in-up">
      <div className="relative px-6 pt-7 pb-5 text-center">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close result"
          className="absolute right-3 top-3 size-8 grid place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="size-4" />
        </button>
        <div
          className={`mx-auto size-12 rounded-full grid place-items-center ${
            check.available ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive"
          }`}
        >
          {check.available ? <CheckCircle2 className="size-6" /> : <Ban className="size-6" />}
        </div>
        <h3 className="mt-3 text-2xl font-display font-semibold tracking-tight">
          {check.available ? "Name Available" : "Name Unavailable"}
        </h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {check.available ? (
            <>
              No registered company or LLP uses <b className="text-foreground">“{check.name}”</b>.
            </>
          ) : (
            <>
              Unfortunately, <b className="text-foreground">“{check.name}”</b> is already taken or
              restricted.
            </>
          )}
        </p>
      </div>

      {/* Company details — the registered entity that blocks the name, or a plain
          "no company found" when there isn't one. */}
      <div className="px-6">
        <div className="text-sm font-semibold mb-2">
          {top ? "Matching record found" : "Company details"}
        </div>
        {top ? (
          <div
            className={`rounded-xl border p-4 ${struck ? "border-destructive/30 bg-destructive/5" : "border-amber-300/60 bg-amber-50/60"}`}
          >
            <div className="flex items-start gap-3">
              <div className="size-9 shrink-0 rounded-lg bg-primary text-white grid place-items-center font-semibold">
                {top.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm break-words">{details?.name || top.name}</div>
                {cin && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-primary font-mono">
                    {/^[LU]\d/.test(cin) ? "CIN" : "LLPIN"}: {cin}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(cin).then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1200);
                        });
                      }}
                      aria-label="Copy identifier"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {copied ? (
                        <CheckCircle2 className="size-3.5 text-success" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  </div>
                )}
                {check.reason && (
                  <div className="mt-1 text-xs text-muted-foreground">{check.reason}</div>
                )}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 rounded-lg border border-border bg-white text-xs overflow-hidden">
              {[
                { l: "Type", v: typeLabel },
                { l: "State / RoC", v: stateRoc },
                { l: "Incorporated", v: incorporated },
                { l: "Status", v: status },
              ].map((c) => (
                <div
                  key={c.l}
                  className="p-2.5 border-b sm:border-b-0 sm:border-r last:border-r-0 border-border"
                >
                  <div className="text-muted-foreground font-medium">{c.l}</div>
                  <div
                    className={`mt-1 font-semibold ${c.l === "Status" && struck ? "text-destructive" : ""}`}
                  >
                    {c.v || "Unavailable"}
                  </div>
                </div>
              ))}
            </div>
            {details?.address && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                Registered office: {details.address}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/40 p-4 flex items-start gap-2.5 text-sm">
            <Info className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
            <span className="text-muted-foreground">
              {check.available
                ? "Unavailable — no company or LLP is registered under this name, so there are no company details to show."
                : check.reason || "Company details are unavailable for this name."}
            </span>
          </div>
        )}
      </div>

      {/* Risk & confidence */}
      <div className="mt-6 px-6 grid grid-cols-2 gap-4">
        {[
          {
            label: "Risk Level",
            ring: (
              <Ring fraction={risk.fill} color={risk.color}>
                <div>
                  <div className={`text-2xl font-display font-semibold ${risk.text}`}>
                    {assessment.risk}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Risk level</div>
                </div>
              </Ring>
            ),
          },
          {
            label: "Confidence",
            ring: (
              <Ring fraction={assessment.confidence / 100} color="var(--primary)">
                <div>
                  <div className="text-2xl font-display font-semibold text-foreground">
                    {assessment.confidence}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">Approval confidence</div>
                </div>
              </Ring>
            ),
          },
        ].map((g) => (
          <div key={g.label} className="flex flex-col items-center">
            <div className="text-sm font-semibold mb-2">{g.label}</div>
            {g.ring}
          </div>
        ))}
      </div>
      <div
        className={`mx-6 mt-5 rounded-xl border p-3.5 flex items-start gap-2.5 text-[13px] ${
          assessment.risk === "High"
            ? "border-destructive/30 bg-destructive/5"
            : assessment.risk === "Medium"
              ? "border-amber-300/60 bg-amber-50/60"
              : "border-success/30 bg-success/5"
        }`}
      >
        <AlertCircle className={`size-4 shrink-0 mt-0.5 ${risk.text}`} />
        <span className="text-foreground/85">{assessment.note}</span>
      </div>

      {/* Proceed */}
      <div className="px-6 py-5">
        {check.available && !choosing && (
          <button
            type="button"
            onClick={proceed}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl gradient-brand text-white font-semibold text-sm shadow-brand hover:brightness-110 transition-all"
          >
            Proceed with this name
            <ArrowRight className="size-4" />
          </button>
        )}
        {check.available && choosing && (
          <div className="rounded-xl border border-border p-4">
            <div className="text-sm font-semibold text-center">Register “{check.name}” as a…</div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onProceed("pvt")}
                className="flex items-center gap-3 rounded-xl border border-border p-3.5 text-left hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Building2 className="size-5 text-primary shrink-0" />
                <span>
                  <span className="block text-sm font-semibold">Company</span>
                  <span className="block text-xs text-muted-foreground">
                    Private / Public Limited, OPC & more
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onProceed("llp")}
                className="flex items-center gap-3 rounded-xl border border-border p-3.5 text-left hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Handshake className="size-5 text-primary shrink-0" />
                <span>
                  <span className="block text-sm font-semibold">LLP</span>
                  <span className="block text-xs text-muted-foreground">
                    Limited Liability Partnership
                  </span>
                </span>
              </button>
            </div>
          </div>
        )}
        {!check.available && (
          <p className="text-[13px] text-muted-foreground text-center">
            Try a more distinctive name — you can submit up to two names when applying for
            registration.
          </p>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground text-center">
          Risk and confidence are estimates from the MCA registry match. The final approval of a
          name rests with the Ministry of Corporate Affairs.
        </p>
      </div>
    </div>
  );
}
