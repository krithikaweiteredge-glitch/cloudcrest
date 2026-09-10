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

/**
 * Keys already shown in a dedicated field/card (Applicant contact, Registered
 * office, Objects) or rendered as their own section (the required-document
 * checklist), so the catch-all skips them rather than repeating them.
 */
const KNOWN_FORM_KEYS = new Set([
  "requiredDocuments",
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

/**
 * Wizards that ask the applicant to pick from a list send both the stored code
 * and the label the applicant actually saw (`entityType` + `entityTypeLabel`).
 * When both are present only the label is worth showing, under the plain name —
 * otherwise the same answer appears twice, once as an internal code.
 */
function collapseCodeLabelPairs(fd: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fd };
  for (const key of Object.keys(fd)) {
    if (!key.endsWith("Label")) continue;
    const base = key.slice(0, -"Label".length);
    if (!(base in out)) continue;
    const label = out[key];
    if (label == null || label === "") continue;
    out[base] = label;
    delete out[key];
  }
  return out;
}

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
  total: "Total Estimated Fee",
  dsc: "DSC",
  // Entity type / class, as each wizard names it
  entitytype: "Entity Type",
  entitytypelabel: "Entity Type",
  entitystatus: "Entity Status",
  orgtype: "Organisation Type",
  orgtypelabel: "Organisation Type",
  promotertype: "Promoter Type",
  projecttype: "Project Type",
  citizenship: "Applicant Type / Citizenship",
  // Registered office
  state: "State",
  city: "City",
  pincode: "PIN Code",
  address: "Registered Office Address",
  officestate: "State of Registered Office",
  // People and counts
  trusteescount: "Number of Trustees",
  committeecount: "Executive Committee Members",
  governingbodycount: "Governing Body Members",
  governingbodytitle: "Governing Body Designation",
  governingbody: "Governing Body Members",
  settlorname: "Settlor Name",
  settlordetails: "Settlor Details",
  trustees: "Trustees",
  signatoryname: "Authorised Signatory",
  signatoryisofficer: "Signatory Is An Officer Of The Entity",
  hasdirectparent: "Has A Direct Parent Entity",
  designation: "Designation",
  // Activity / nature of business
  category: "Activity Category",
  sector: "Sector",
  activities: "Activities",
  natureactivities: "Nature of Activities",
  natureofoperations: "Nature of Operations",
  natureofbusiness: "Nature of Business",
  businessnature: "Nature of Business",
  businessdescription: "Business Description",
  majoractivity: "Major Activity",
  societyobjects: "Objects of the Society",
  trustobjects: "Objects of the Trust",
  // Registration / statutory identifiers
  registrationauthority: "Registration Authority",
  registrationnumber: "Registration Number",
  reraauthority: "RERA Authority",
  projectname: "Project Name",
  commencementdate: "Commencement Date",
  completiondate: "Proposed Completion Date",
  corpusvalue: "Corpus Value",
  // Applicant demographics (MSME / Udyam)
  socialcategory: "Social Category",
  gender: "Gender",
  speciallyabled: "Specially Abled",
  employmentmale: "Employment — Male",
  employmentfemale: "Employment — Female",
  employmentothers: "Employment — Others",
  employmenttotal: "Employment — Total",
  // Banking and contact
  bankmode: "Bank Account Mode",
  accountnumber: "Account Number",
  ifsc: "IFSC Code",
  officialemail: "Official Email",
  officialphone: "Official Phone",
  authorisedemail: "Authorised Email",
  authorisedphone: "Authorised Phone",
  email: "Email",
  phone: "Phone",
  // Business conversions
  conversiontype: "Conversion Type",
  existingentityname: "Existing Company Name",
  cin: "CIN of the Company",
  currentshareholders: "Current Number of Shareholders",
  currentdirectors: "Current Number of Directors",
  proposedshareholders: "Proposed Number of Shareholders",
  proposeddirectors: "Proposed Number of Directors",
  designatedpartners: "Number of Designated Partners",
  paidupcapital: "Paid-up Capital",
  capitalcontribution: "Total Capital Contribution (As Per Books)",
  // Business closures
  closuretype: "Closure Type",
  entityname: "Name of the Entity",
  llpin: "LLPIN (LLP Identification Number)",
  contactperson: "Primary Contact Person Name",
  reasonforclosure: "Reason for Closure",
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
    if (k.includes("capital") || k === "price" || k === "corpusvalue" || k === "total" || k.includes("fee")) {
      return `₹${value.toLocaleString("en-IN")}`;
    }
    return String(value);
  }
  if (typeof value === "string") {
    if ((k.includes("capital") || k === "price" || k === "corpusvalue" || k === "total" || k.includes("fee")) && !isNaN(Number(value)) && Number(value) > 0) {
      return `₹${Number(value).toLocaleString("en-IN")}`;
    }
    return value;
  }
  return String(value);
}

/**
 * Flatten one object's fields into `[label path, value]` pairs, descending into
 * nested objects so nothing the applicant entered is hidden. Keys keep their
 * stored names; nested ones read as "Parent → Child".
 */
function flattenEntries(
  obj: Record<string, unknown>,
  prefix = "",
  depth = 0
): [string, unknown][] {
  if (depth > 3) return [];
  const out: [string, unknown][] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value == null || value === "") continue;
    const label = prefix ? `${prefix} \u2192 ${humanizeFieldKey(key)}` : humanizeFieldKey(key);

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if (typeof value[0] === "object" && value[0] !== null) {
        value.forEach((entry, i) => {
          out.push(
            ...flattenEntries(entry as Record<string, unknown>, `${label} ${i + 1}`, depth + 1)
          );
        });
      } else {
        out.push([label, value]);
      }
    } else if (typeof value === "object") {
      out.push(...flattenEntries(value as Record<string, unknown>, label, depth + 1));
    } else {
      out.push([label, value]);
    }
  }

  return out;
}

/**
 * Render an "Additional Details" card listing all captured form values
 * from the wizard stepper (including nested settlor/trustee/partner objects and arrays)
 * not already surfaced in a dedicated card.
 */
export function renderExtraFormFields(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== "object") return null;
  const fd = collapseCodeLabelPairs(raw);

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
  const feeBreakdowns: [string, any[]][] = [];

  const hasFeeBreakdown = entries.some(
    ([k, v]) =>
      Array.isArray(v) &&
      v.length > 0 &&
      typeof v[0] === "object" &&
      v[0] !== null &&
      ("label" in v[0] || "amount" in v[0] || k.toLowerCase().includes("fee"))
  );

  for (const [k, v] of entries) {
    if (k === "total" && hasFeeBreakdown) continue;

    if (Array.isArray(v)) {
      if (v.length > 0 && typeof v[0] === "object" && v[0] !== null) {
        if (k.toLowerCase().includes("fee") || ("label" in v[0] && "amount" in v[0])) {
          feeBreakdowns.push([k, v]);
        } else {
          objectArrays.push([k, v]);
        }
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

      {/* Fee Breakdown (e.g. fees, feeLines) */}
      {feeBreakdowns.map(([k, arr]) => {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        const totalSum = arr.reduce((acc, item) => acc + (Number(item?.amount) || 0), 0);
        const displayTotal =
          fd.total != null && Number(fd.total) > 0 ? Number(fd.total) : totalSum;
        return (
          <div key={k} className="p-3.5 rounded-lg border border-border/60 bg-muted/20 space-y-2 mt-2">
            <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary block">
                Fee Breakdown
              </span>
              <span className="text-[10px] text-muted-foreground">Estimated</span>
            </div>
            <div className="space-y-1.5 text-xs pt-0.5">
              {arr.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-1 border-b border-border/20 last:border-0"
                >
                  <span className="text-foreground/90 font-medium">{item.label || `Fee Line ${idx + 1}`}</span>
                  <span className="font-semibold text-foreground mono">
                    ₹{Number(item.amount || 0).toLocaleString("en-IN")}
                  </span>
                </div>
              ))}
              {displayTotal > 0 && (
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/60 font-bold text-xs">
                  <span className="text-foreground">Total Fee</span>
                  <span className="text-primary mono text-sm font-bold">
                    ₹{displayTotal.toLocaleString("en-IN")}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Nested detail objects (e.g. Settlor Details) */}
      {nestedObjects.map(([k, obj]) => {
        // Nested objects and arrays used to be dropped here, which silently hid
        // whatever the applicant entered under them. Everything non-empty is
        // rendered now; a nested structure is flattened into "Parent → Child".
        const objEntries = flattenEntries(obj);
        if (objEntries.length === 0) return null;
        return (
          <div key={k} className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2 mt-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary block">
              {humanizeFieldKey(k)}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
              {objEntries.map(([ik, iv]) => (
                <div key={ik}>
                  <span className="text-[11px] text-muted-foreground block">{ik}</span>
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
                    {flattenEntries(item)
                      .filter(([ik]) => !["Full Name", "Name", "Designation"].includes(ik))
                      .map(([ik, iv]) => (
                        <div key={ik}>
                          <span className="text-muted-foreground block">{ik}</span>
                          <span className="font-medium text-foreground truncate block">
                            {formatFieldValue(ik, iv)}
                          </span>
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
