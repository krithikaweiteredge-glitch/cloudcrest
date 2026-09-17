/**
 * Trade Licence road-width rates — mirrors `backend/src/config/tradeLicenceCatalog.ts`.
 * The rates are admin content on each `trade-licence-<state>` row's wizard
 * rules (`{ roadWidthRates: { single, double, multiple, star } }`); the
 * document's table fills any the row doesn't set. The backend computes the
 * billed Govt Fee — these are for display and the admin editor.
 */

export type RoadWidthKey = "single" | "double" | "multiple" | "star";

export const ROAD_WIDTHS: { key: RoadWidthKey; label: string }[] = [
  { key: "single", label: "Single Lane (upto 20 ft)" },
  { key: "double", label: "Double Lane (upto 30 ft)" },
  { key: "multiple", label: "Multiple Lane (>30 ft)" },
  { key: "star", label: "Star Hotels / Corporate Hospitals (>30 ft)" },
];

export const TRADE_LICENCE_DEFAULT_RATES: Record<RoadWidthKey, number> = {
  single: 3,
  double: 4,
  multiple: 5,
  star: 6,
};

export function resolveRoadWidthRates(wizardRules: string | null | undefined): Record<RoadWidthKey, number> {
  const rates = { ...TRADE_LICENCE_DEFAULT_RATES };
  try {
    const saved = wizardRules ? JSON.parse(wizardRules)?.roadWidthRates : null;
    if (saved && typeof saved === "object") {
      for (const { key } of ROAD_WIDTHS) {
        const n = Number(saved[key]);
        if (saved[key] !== undefined && saved[key] !== "" && Number.isFinite(n) && n >= 0) rates[key] = n;
      }
    }
  } catch {
    /* malformed — defaults */
  }
  return rates;
}
