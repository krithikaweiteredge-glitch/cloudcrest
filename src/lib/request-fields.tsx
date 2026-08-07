/**
 * Helpers for rendering a registration's captured form fields in the request
 * detail modals (customer view in profile.requests, staff view in admin).
 *
 * The detail modals render the important fields (name, capital, directors, …) in
 * dedicated, labelled cards. `renderExtraFormFields` is the safety net: it shows
 * every OTHER primitive value stored on the request's `formData` so that nothing
 * the applicant filled in is silently hidden from either the customer or the
 * admin — the requirement that "all the things filled in the form should be
 * visible for the user and the admin".
 */

/** Keys already shown in a dedicated field/card, so the catch-all skips them. */
const KNOWN_FORM_KEYS = new Set([
  "name1",
  "name2",
  "suffix",
  "industryType",
  "entityClass",
  "liability",
  "members",
  "llpType",
  "foreignCountry",
  "gstType",
  "partnershipType",
  "directors",
  "shareholders",
  "partners",
  "partnersCount",
  "nominee",
  "address",
  "city",
  "state",
  "pincode",
  "objects",
  "capital",
  "paidCapital",
  "totalCapital",
]);

/** Acronyms that should stay upper-cased rather than title-cased. */
const LABEL_OVERRIDES: Record<string, string> = {
  gstin: "GSTIN",
  pan: "PAN",
  tan: "TAN",
  din: "DIN",
  dpin: "DPIN",
  llp: "LLP",
};

/** Turn a camelCase / snake_case form key into a human "Title Case" label. */
export function humanizeFieldKey(key: string): string {
  const override = LABEL_OVERRIDES[key.toLowerCase()];
  if (override) return override;
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Render an "Additional Details" card listing any primitive `formData` values
 * not already surfaced in a dedicated field. Returns null when there's nothing
 * extra to show.
 */
export function renderExtraFormFields(fd: Record<string, unknown> | null | undefined) {
  if (!fd || typeof fd !== "object") return null;
  const extra = Object.entries(fd).filter(
    ([k, v]) =>
      !KNOWN_FORM_KEYS.has(k) &&
      v != null &&
      v !== "" &&
      (typeof v === "string" || typeof v === "number" || typeof v === "boolean"),
  );
  if (extra.length === 0) return null;
  return (
    <div className="p-4 rounded-xl border border-border/70 bg-card space-y-2 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 border-b border-border/60 pb-2">
        Additional Details
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
        {extra.map(([k, v]) => (
          <div key={k}>
            <span className="text-[11px] text-muted-foreground block">{humanizeFieldKey(k)}</span>
            <span className="font-medium text-foreground break-words">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
