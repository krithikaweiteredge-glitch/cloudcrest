/**
 * Per-type rules for the Business Conversion stepper.
 *
 * Every conversion service (`conversion-*`) carries these in its catalog row's
 * `wizardRules` JSON, edited in Admin → Services → "Conversion Stepper Rules".
 * The stepper reads them for the eligibility banner above the form, the
 * statutory minimums it validates against, and the notes shown on individual
 * steps. Nothing about a specific conversion is hardcoded here — a missing or
 * malformed blob resolves to "no rules": no banner, no notes, no count limits.
 */
export type ConversionRules = {
  /** One rule per line. */
  eligibility: string;
  minShareholders: number | null;
  maxShareholders: number | null;
  minDirectors: number | null;
  minPartners: number | null;
  notes: {
    name: string;
    members: string;
    capital: string;
  };
};

export const EMPTY_CONVERSION_RULES: ConversionRules = {
  eligibility: "",
  minShareholders: null,
  maxShareholders: null,
  minDirectors: null,
  minPartners: null,
  notes: { name: "", members: "", capital: "" },
};

const text = (v: unknown) => (typeof v === "string" ? v : "");
const count = (v: unknown): number | null => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

export function resolveConversionRules(raw?: string | null): ConversionRules {
  if (!raw) return EMPTY_CONVERSION_RULES;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return EMPTY_CONVERSION_RULES;
    const n = p.notes && typeof p.notes === "object" ? p.notes : {};
    return {
      eligibility: text(p.eligibility),
      minShareholders: count(p.minShareholders),
      maxShareholders: count(p.maxShareholders),
      minDirectors: count(p.minDirectors),
      minPartners: count(p.minPartners),
      notes: {
        name: text(n.name),
        members: text(n.members),
        capital: text(n.capital),
      },
    };
  } catch {
    return EMPTY_CONVERSION_RULES;
  }
}

export function serializeConversionRules(rules: ConversionRules): string {
  return JSON.stringify(rules);
}

/** Split a one-per-line field into its non-empty lines, dropping any bullet glyph. */
export function ruleLines(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);
}
