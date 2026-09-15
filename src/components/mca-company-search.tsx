import { useEffect, useRef, useState } from "react";
import { Building2, Loader2, Search } from "lucide-react";
import { fieldClass } from "@/components/wizard-ui";

/**
 * MCA registry lookups shared by the Business Conversion and Business Closure
 * steppers: the similar-name search and the existing-company picker.
 */

/** A registry match from `GET /api/mca/similar`. */
export type McaMatch = {
  name: string;
  identifier?: string;
  entityType?: string;
  industry?: string;
  status?: string;
};

/** A company record from `POST /api/mca/company-details`. */
export type McaCompanyDetails = {
  name: string;
  cin?: string;
  entityType?: string;
  incorporationDate?: string | null;
  address?: string;
  state?: string;
  companyStatus?: string;
  status?: string;
  authorizedCapital?: string | number;
  paidUpCapital?: string | number;
  roc?: string;
};

const BACKEND = () => import.meta.env.VITE_BACKEND_URL || "";

type LookupState = "idle" | "loading" | "done" | "error";

/**
 * Debounced `GET /api/mca/similar` lookup: registered companies, LLPs and
 * struck-off entities whose name is close to `term`. Pass an empty term to
 * skip the lookup.
 */
export function useSimilarNames(term: string): { matches: McaMatch[]; state: LookupState } {
  const [matches, setMatches] = useState<McaMatch[]>([]);
  const [state, setState] = useState<LookupState>("idle");

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setMatches([]);
      setState("idle");
      return;
    }
    setState("loading");
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${BACKEND()}/api/mca/similar?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`Registry lookup failed (${res.status})`);
        const data = await res.json();
        setMatches(Array.isArray(data.matches) ? data.matches : []);
        setState("done");
      } catch (err) {
        // An abort is just the next keystroke superseding this request.
        if ((err as Error)?.name === "AbortError") return;
        setMatches([]);
        setState("error");
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term]);

  return { matches, state };
}

/**
 * Existing-company picker: as the applicant types, registered companies with a
 * similar name are listed from the MCA index; picking one fetches the company's
 * details (CIN, registered office, capital) and hands them to the wizard.
 *
 * Only live Indian entities are listed (foreign companies and struck-off names
 * are dropped); `accept` narrows that further, e.g. to LLPs only.
 */
export function CompanySearch({
  value,
  placeholder,
  error,
  selected,
  onType,
  onSelect,
  accept,
  emptyText = "No registered company matches this name.",
}: {
  value: string;
  placeholder?: string;
  error?: string;
  selected: McaCompanyDetails | null;
  onType: (v: string) => void;
  onSelect: (c: McaCompanyDetails) => void;
  accept?: (m: McaMatch) => boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Look up while the applicant is typing — not once a company has been picked
  // (the field then holds its registered name).
  const { matches: found, state } = useSimilarNames(selected ? "" : value);
  // Live Indian companies and LLPs (private, public, OPC, LLP) — drop foreign
  // companies and struck-off names, which can't be converted or closed.
  const matches = found.filter(
    (m) => m.entityType !== "Foreign Company" && !/strike/i.test(m.status || "") && (!accept || accept(m)),
  );

  // Close the dropdown on an outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = async (m: McaMatch) => {
    setOpen(false);
    setFetchError(null);
    if (!m.identifier) {
      onSelect({ name: m.name, entityType: m.entityType });
      return;
    }
    setFetching(true);
    try {
      const res = await fetch(`${BACKEND()}/api/mca/company-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cin: m.identifier }),
      });
      const data = res.ok ? await res.json() : null;
      if (data?.found && data.company) {
        onSelect({
          ...data.company,
          name: data.company.name || m.name,
          cin: data.company.cin || m.identifier,
          // data.gov.in labels an LLP with no class as "Private Limited Company";
          // the registry index's type is the reliable one.
          entityType: m.entityType || data.company.entityType,
        });
      } else {
        onSelect({ name: m.name, cin: m.identifier, entityType: m.entityType });
        setFetchError("Couldn't fetch the full company details — please check the figures on the next steps.");
      }
    } catch {
      onSelect({ name: m.name, cin: m.identifier, entityType: m.entityType });
      setFetchError("Couldn't fetch the full company details — please check the figures on the next steps.");
    } finally {
      setFetching(false);
    }
  };

  const showList = open && !selected && value.trim().length >= 2;
  const money = (v?: string | number) => {
    const n = Number(String(v ?? "").replace(/,/g, ""));
    return v != null && String(v).trim() !== "" && Number.isFinite(n) ? `₹ ${n.toLocaleString("en-IN")}` : "";
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => {
            onType(e.target.value);
            setOpen(true);
            setFetchError(null);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={fieldClass(error) + " pl-9"}
          autoComplete="off"
        />
        {(state === "loading" || fetching) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-primary" />
        )}
      </div>

      {showList && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-border bg-surface shadow-elev">
          {state === "loading" && matches.length === 0 && (
            <div className="px-3 py-2.5 text-xs text-muted-foreground">Searching the MCA registry…</div>
          )}
          {state === "error" && (
            <div className="px-3 py-2.5 text-xs text-destructive">Couldn't reach the MCA registry. Try again in a moment.</div>
          )}
          {state === "done" && matches.length === 0 && (
            <div className="px-3 py-2.5 text-xs text-muted-foreground">{emptyText}</div>
          )}
          {matches.map((m) => (
            <button
              key={`${m.identifier ?? ""}-${m.name}`}
              type="button"
              onClick={() => pick(m)}
              className="w-full text-left px-3 py-2.5 hover:bg-muted border-b border-border/60 last:border-0 cursor-pointer"
            >
              <div className="text-sm font-medium text-foreground">{m.name}</div>
              <div className="text-[11px] text-muted-foreground mono">
                {[m.identifier, m.entityType].filter(Boolean).join(" · ")}
              </div>
            </button>
          ))}
        </div>
      )}

      {fetchError && <p className="mt-2 text-[11px] text-warning">{fetchError}</p>}

      {selected && !fetching && (
        <div className="mt-3 rounded-lg border border-success/30 bg-success/[0.06] p-3.5 text-xs">
          <div className="flex items-center gap-2 font-semibold text-foreground mb-2">
            <Building2 className="size-4 text-success" /> {selected.name}
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {[
              ["CIN", selected.cin],
              ["Type", selected.entityType],
              ["Incorporated", selected.incorporationDate || ""],
              ["Status", selected.companyStatus],
              ["Authorised Capital", money(selected.authorizedCapital)],
              ["Paid-up Capital", money(selected.paidUpCapital)],
              ["ROC", selected.roc],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium text-foreground">{v}</dd>
                </div>
              ))}
            {selected.address && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Registered Office</dt>
                <dd className="font-medium text-foreground">{selected.address}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
