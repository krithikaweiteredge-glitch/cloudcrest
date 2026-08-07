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

/* ------------------------------------------------------------------ *
 * Private / Public class overlay.
 *
 * Some entity types exist in both a private and a public form, which the catalog
 * model can't express (each variant has a single suffix + one set of minimums).
 * This overlay adds that second dimension in the frontend: the wizard shows a
 * Private/Public dropdown beside the proposed name for the classable types, and
 * the choice sets the statutory minimums (and, where the legal ending differs,
 * the suffix). Non-classable types keep their catalog rules unchanged.
 * ------------------------------------------------------------------ */

export type EntityClass = "private" | "public";

/** Companies Act minimums: Private = 2 members / 2 directors,
 *  Public = 7 members / 3 directors. */
const PRIVATE_MINS = { minDirectors: 2, minShareholders: 2 };
const PUBLIC_MINS = { minDirectors: 3, minShareholders: 7 };

export type ClassOption = {
  minDirectors: number;
  minShareholders: number;
  /** Overrides the type's suffix when the legal ending is class-specific. */
  suffix?: string;
};

export type ClassSpec = {
  /** Preselected class. */
  default: EntityClass;
  private: ClassOption;
  public: ClassOption;
};

/**
 * Entity types (keyed by short entity key) offered in both a private and public
 * form. The wizard renders a Private/Public dropdown for these.
 */
export const CLASSABLE_TYPES: Record<string, ClassSpec> = {
  // Section 8 (non-profit) — licensed as either a private or a public company.
  sec8: { default: "private", private: { ...PRIVATE_MINS }, public: { ...PUBLIC_MINS } },
  // Unlimited company (catalog slug company-guarantee): the legal ending IS the
  // private/public distinction, so the class drives the suffix.
  guarantee: {
    default: "private",
    private: { ...PRIVATE_MINS, suffix: "Private Limited" },
    public: { ...PUBLIC_MINS, suffix: "Limited" },
  },
  // Nidhi is legally a public company (min 7 members / 3 directors); the private
  // form is offered per the client's request and defaults to public.
  nidhi: { default: "public", private: { ...PRIVATE_MINS }, public: { ...PUBLIC_MINS } },
};

/**
 * Fixed statutory minimums that override the catalog for a type regardless of
 * admin config. Currently only the Producer Company (min 10 members /
 * 5 directors under Part IXA of the Companies Act, 1956).
 */
export const STATUTORY_MIN_OVERRIDES: Record<string, { minDirectors: number; minShareholders: number }> = {
  producer: { minDirectors: 5, minShareholders: 10 },
};

export function isClassable(key: string): boolean {
  return key in CLASSABLE_TYPES;
}

/* ------------------------------------------------------------------ *
 * Limited by Shares vs Limited by Guarantee overlay.
 *
 * Private Limited, Public Limited and Section 8 companies can each be
 * constituted either "limited by shares" (the applicant states a share capital)
 * or "limited by guarantee" (no share capital — the applicant states a number of
 * members instead). This drives BOTH the wizard question (Share Capital vs
 * Number of Members) and the fee engine, which prices a guarantee company off
 * the member count per Table I(II) of the Fee Rules.
 * ------------------------------------------------------------------ */

export type Liability = "shares" | "guarantee";

/** Entity keys that offer the Limited by Shares / Limited by Guarantee choice. */
export const LIABILITY_TYPES = new Set(["pvt", "public", "sec8"]);

export function hasLiabilityChoice(key: string): boolean {
  return LIABILITY_TYPES.has(key);
}

export const LIABILITY_LABEL: Record<Liability, string> = {
  shares: "Limited by Shares",
  guarantee: "Limited by Guarantee",
};

export type EffectiveRules = {
  minDirectors: number;
  minShareholders: number;
  /** Set only when the chosen class dictates the suffix (e.g. Unlimited). */
  suffixOverride?: string;
};

/**
 * Effective incorporation minimums for a type, layering (in priority order) the
 * chosen private/public class, then any fixed statutory override, then the
 * catalog rules.
 */
export function resolveEffectiveRules(
  key: string,
  cls: EntityClass | null,
  catalog: { minDirectors: number; minShareholders: number },
): EffectiveRules {
  const spec = CLASSABLE_TYPES[key];
  if (spec) {
    const opt = spec[cls ?? spec.default];
    return {
      minDirectors: opt.minDirectors,
      minShareholders: opt.minShareholders,
      suffixOverride: opt.suffix,
    };
  }
  const override = STATUTORY_MIN_OVERRIDES[key];
  if (override) return { ...override };
  return { minDirectors: catalog.minDirectors, minShareholders: catalog.minShareholders };
}
