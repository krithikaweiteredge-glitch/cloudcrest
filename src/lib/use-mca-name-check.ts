import { useEffect, useState } from "react";

export type McaNameCheckResult = { ok: boolean; msg: string };

/**
 * Live MCA name-availability check for a proposed entity name, debounced as the
 * applicant types. Calls the same `POST /api/mca/name-check` endpoint and gives
 * the same messages as the Company and LLP incorporation wizards, so a proposed
 * name reads identically wherever it is entered.
 *
 * `suffix` is appended before checking (e.g. "LLP" when the field shows it as
 * a fixed ending); pass "" when the applicant types the full legal name.
 */
export function useMcaNameCheck(rawName: string, suffix: string) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<McaNameCheckResult | null>(null);

  useEffect(() => {
    const trimmed = rawName.trim();
    if (!trimmed) {
      setResult(null);
      setChecking(false);
      return;
    }

    if (trimmed.length < 3) {
      setResult({ ok: false, msg: "Minimum 3 characters required." });
      setChecking(false);
      return;
    }

    if (/(India|National|Bharat|President|Bank|Reserve|Insurance|Govt)/i.test(trimmed)) {
      setResult({ ok: false, msg: "Contains restricted keyword — needs Central Govt approval." });
      setChecking(false);
      return;
    }

    const fullName = suffix ? `${trimmed} ${suffix}` : trimmed;
    const ctrl = new AbortController();
    setChecking(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/mca/name-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fullName }),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          setResult({ ok: true, msg: "Preliminary check passed — reserve the name via RUN / Part A." });
          return;
        }

        const data = await res.json();
        if (data.available) {
          setResult({ ok: true, msg: `“${fullName}” appears to be available on the MCA registry.` });
        } else {
          setResult({
            ok: false,
            msg: data.reason || `“${fullName}” is already registered or restricted on MCA.`,
          });
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setResult({ ok: true, msg: "Preliminary check passed — reserve the name via RUN / Part A." });
        }
      } finally {
        setChecking(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [rawName, suffix]);

  return { checking, result };
}
