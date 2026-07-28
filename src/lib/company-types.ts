/**
 * Incorporation rules for the wizard-driven entity types (company / llp variants).
 *
 * These used to be hardcoded in the Company wizard. They now live in the catalog:
 * each variant service can carry a `wizardRules` JSON blob an admin edits in the
 * Services panel. This module holds the built-in DEFAULTS (so existing types keep
 * their exact current behaviour) and the resolver that layers a service's saved
 * overrides on top.
 */
export type WizardRules = {
  /** Legal name suffix appended to the proposed company name. "/"-separated = a choice. */
  suffix: string;
  minDirectors: number;
  minShareholders: number;
  /** OPC-style: a nominee is mandatory. */
  requiresNominee: boolean;
  tags: string[];
  popular: boolean;
};

/** Applied to any type without its own defaults or overrides. */
export const GENERIC_RULES: WizardRules = {
  suffix: "",
  minDirectors: 2,
  minShareholders: 2,
  requiresNominee: false,
  tags: [],
  popular: false,
};

/**
 * Built-in per-type defaults, keyed by entity key (`company-pvt` -> `pvt`). Only
 * fields that differ from GENERIC_RULES are listed — importantly the min
 * directors/shareholders match exactly what the wizard enforced before this was
 * catalog-driven (only public and opc differ from 2/2), so behaviour is unchanged
 * until an admin overrides a type in the Services panel.
 */
export const COMPANY_TYPE_DEFAULTS: Record<string, Partial<WizardRules>> = {
  pvt: { suffix: "Private Limited", tags: ["FDI Friendly", "Min 2 Dir"], popular: true },
  public: { suffix: "Limited", minDirectors: 3, minShareholders: 7, tags: ["Min 3 Dir · 7 Sh"] },
  opc: { suffix: "(OPC) Private Limited", minDirectors: 1, minShareholders: 1, requiresNominee: true, tags: ["Single Member"] },
  sec8: { suffix: "Foundation / Trust / Association", tags: ["Tax Exempt"] },
  guarantee: { suffix: "Limited", tags: [] },
  nidhi: { suffix: "Nidhi Limited", tags: ["Mutual Benefit"] },
  producer: { suffix: "Producer Company Limited", tags: ["Agri / Producer"] },
  foreign: { suffix: "Branch / Liaison Office", tags: ["RBI Approval"] },
};

/**
 * Resolve the effective rules for a type: built-in defaults for `key`, with the
 * service's saved `wizardRules` JSON (if any) layered on top. Tolerant of missing
 * or malformed JSON — falls back to the defaults field by field.
 */
export function resolveWizardRules(key: string, rawJson?: string | null): WizardRules {
  const base: WizardRules = { ...GENERIC_RULES, ...(COMPANY_TYPE_DEFAULTS[key] || {}) };
  if (!rawJson) return base;
  try {
    const p = JSON.parse(rawJson);
    if (!p || typeof p !== "object") return base;
    const posInt = (v: unknown, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
    };
    return {
      suffix: typeof p.suffix === "string" && p.suffix.trim() ? p.suffix : base.suffix,
      minDirectors: posInt(p.minDirectors, base.minDirectors),
      minShareholders: posInt(p.minShareholders, base.minShareholders),
      requiresNominee: typeof p.requiresNominee === "boolean" ? p.requiresNominee : base.requiresNominee,
      tags: Array.isArray(p.tags) ? p.tags.map(String) : base.tags,
      popular: typeof p.popular === "boolean" ? p.popular : base.popular,
    };
  } catch {
    return base;
  }
}
