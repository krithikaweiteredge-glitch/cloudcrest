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

/** Keys already shown in a dedicated field/card (Applicant contact, Registered office, Objects), so the catch-all skips them. */
const KNOWN_FORM_KEYS = new Set([
  "applicantName",
  "applicantMobile",
  "applicantEmail",
  "applicantPhone",
  "contactName",
  "contactEmail",
  "contactPhone",
  "address",
  "city",
  "state",
  "pincode",
  "objects",
]);

/** Acronyms and specific field name overrides. */
const LABEL_OVERRIDES: Record<string, string> = {
  name1: "Proposed Name 1",
  name2: "Proposed Name 2",
  suffix: "Entity Suffix",
  industrytype: "Industry Type",
  entityclass: "Company Class",
  liability: "Liability Clause",
  members: "Number of Members",
  memberscount: "Number of Members",
  llptype: "LLP Type",
  foreigncountry: "Country of Incorporation",
  gsttype: "GST Registration Type",
  partnershiptype: "Partnership Type",
  trusttype: "Trust Type",
  societytype: "Society Type",
  hufname: "HUF Name",
  kartaname: "Karta Name",
  enterprisename: "Enterprise Name",
  firmname: "Firm Name",
  legalname: "Legal Entity Name",
  societyname: "Society Name",
  trustname: "Trust Name",
  ngoname: "NGO / VO Name",
  citizenshiplabel: "Applicant Type / Citizenship",
  dsctype: "DSC Type",
  dscplan: "DSC Plan",
  price: "Price / Plan Fee",
  directors: "Number of Directors",
  shareholders: "Number of Shareholders",
  partners: "Number of Partners",
  partnerscount: "Number of Partners",
  nominee: "Nominee Name",
  capital: "Authorised Capital",
  paidcapital: "Paid-up Capital",
  totalcapital: "Authorised Capital",
  authorisedcapital: "Authorised Capital",
  directorsareshareholders: "Directors Are Shareholders",
  additionalshareholders: "Additional Shareholders",
  existingdins: "Existing DINs / Directors",
  companytype: "Company Type",
  natureofactivities: "Nature of Activities",
  corpussource: "Corpus Source",
  briefdescription: "Brief Description / Purpose",
  registeredaddress: "Registered Address",
  tradename: "Trade Name",
  proprietorname: "Proprietor Name",
  gstin: "GSTIN",
  pan: "PAN",
  tan: "TAN",
  din: "DIN",
  dpin: "DPIN",
  llp: "LLP",
  huf: "HUF",
  dsc: "DSC",
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

export function formatFieldValue(key: string, value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (typeof value[0] === "string" || typeof value[0] === "number") {
      return value.join(", ");
    }
    return `${value.length} items`;
  }
  const k = key.toLowerCase();
  if (typeof value === "number") {
    if (k.includes("capital") || k === "price" || k === "corpusvalue") {
      return `₹${value.toLocaleString("en-IN")}`;
    }
    return String(value);
  }
  if (typeof value === "string") {
    if ((k.includes("capital") || k === "price" || k === "corpusvalue") && !isNaN(Number(value)) && Number(value) > 0) {
      return `₹${Number(value).toLocaleString("en-IN")}`;
    }
    return value;
  }
  return String(value);
}

/**
 * Render an "Additional Details" card listing all captured form values
 * from the wizard stepper (including nested settlor/trustee/partner objects and arrays)
 * not already surfaced in a dedicated card.
 */
export function renderExtraFormFields(fd: Record<string, unknown> | null | undefined) {
  if (!fd || typeof fd !== "object") return null;

  // Deduplication check
  const duplicateValues = new Set<string>();
  if (fd.trustName && typeof fd.trustName === "string") duplicateValues.add(fd.trustName.trim().toLowerCase());
  if (fd.businessName && typeof fd.businessName === "string") duplicateValues.add(fd.businessName.trim().toLowerCase());
  if (fd.corpusValue != null) duplicateValues.add(String(fd.corpusValue));

  const entries = Object.entries(fd).filter(([k, v]) => {
    if (KNOWN_FORM_KEYS.has(k)) return false;
    if (v == null || v === "") return false;

    // Deduplicate identical alias fields
    if (k === "name1" && typeof v === "string" && duplicateValues.has(v.trim().toLowerCase())) return false;
    if (k === "capital" && fd.corpusValue != null) return false;
    if (k === "registeredAddress" && fd.address != null) return false;
    if (k === "trustObjects" && fd.objects != null) return false;

    return true;
  });

  if (entries.length === 0) return null;

  const primitives: [string, unknown][] = [];
  const nestedObjects: [string, Record<string, unknown>][] = [];
  const objectArrays: [string, any[]][] = [];

  for (const [k, v] of entries) {
    if (Array.isArray(v)) {
      if (v.length > 0 && typeof v[0] === "object" && v[0] !== null) {
        objectArrays.push([k, v]);
      } else {
        primitives.push([k, v]);
      }
    } else if (typeof v === "object" && v !== null) {
      nestedObjects.push([k, v as Record<string, unknown>]);
    } else {
      primitives.push([k, v]);
    }
  }

  return (
    <div className="p-4 rounded-xl border border-border/70 bg-card space-y-3 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 border-b border-border/60 pb-2">
        Application Form Details
      </div>

      {/* Primitives and simple arrays */}
      {primitives.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
          {primitives.map(([k, v]) => (
            <div key={k}>
              <span className="text-[11px] text-muted-foreground block">{humanizeFieldKey(k)}</span>
              <span className="font-medium text-foreground break-words">{formatFieldValue(k, v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Nested detail objects (e.g. Settlor Details) */}
      {nestedObjects.map(([k, obj]) => {
        const objEntries = Object.entries(obj).filter(
          ([_, val]) => val != null && val !== "" && typeof val !== "object"
        );
        if (objEntries.length === 0) return null;
        return (
          <div key={k} className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2 mt-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary block">
              {humanizeFieldKey(k)}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
              {objEntries.map(([ik, iv]) => (
                <div key={ik}>
                  <span className="text-[11px] text-muted-foreground block">{humanizeFieldKey(ik)}</span>
                  <span className="font-semibold text-foreground break-words">{formatFieldValue(ik, iv)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Object arrays (e.g. Trustees, Directors, Partners) */}
      {objectArrays.map(([k, arr]) => {
        if (arr.length === 0) return null;
        return (
          <div key={k} className="space-y-2 mt-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              {humanizeFieldKey(k)} ({arr.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {arr.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                    <span className="font-bold text-foreground">
                      {item.fullName || item.name || `${humanizeFieldKey(k).replace(/s$/, "")} ${idx + 1}`}
                    </span>
                    {item.designation && (
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {item.designation}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                    {Object.entries(item)
                      .filter(([ik, iv]) => !["fullName", "name", "designation"].includes(ik) && iv != null && iv !== "")
                      .map(([ik, iv]) => (
                        <div key={ik}>
                          <span className="text-muted-foreground block">{humanizeFieldKey(ik)}</span>
                          <span className="font-medium text-foreground truncate block">{String(iv)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
