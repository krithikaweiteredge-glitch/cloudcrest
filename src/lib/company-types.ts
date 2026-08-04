/**
 * Incorporation rules for the wizard-driven entity types (company / llp variants).
 *
 * The per-type values (suffix, min directors/shareholders, nominee, card tags,
 * "popular") live in the catalog: each variant service carries a `wizardRules`
 * JSON blob, seeded in the DB and editable in Admin → Services. Nothing about a
 * specific entity type is hardcoded here — this module only holds a neutral
 * GENERIC fallback (used when a row has no rules yet) and the resolver that reads
 * a service's saved JSON.
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
 * Resolve the effective rules for a type from its saved `wizardRules` JSON,
 * falling back field-by-field to the neutral GENERIC_RULES when a value is
 * missing or the JSON is absent/malformed. The per-type values are seeded into
 * the DB (see backend config/companyWizardDefaults) and edited in the catalog —
 * `key` is retained only for call-site compatibility and no longer selects any
 * hardcoded per-type defaults.
 */
export function resolveWizardRules(_key: string, rawJson?: string | null): WizardRules {
  const base: WizardRules = { ...GENERIC_RULES };
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
