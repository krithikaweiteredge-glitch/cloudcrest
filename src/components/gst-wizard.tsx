import { TypePickerPage, type RegistrationType } from "@/components/type-picker-page";
import { ShieldCheck, Zap, ClipboardList, FileDown } from "lucide-react";

/**
 * GST registration entry point. The applicant picks WHICH kind of GST
 * registration they need (the nine categories below), shown as cards like the
 * company entity-type picker. Selecting one opens the standard tabbed service
 * page (About / Who can apply / Documents / Acts & Rules + Start Application)
 * for that exact category, and the chosen category is recorded on the request
 * (`gstType`) so the customer and admin both see which GST registration it was.
 */

// Common documents most GST categories need; each type layers its specifics on.
const COMMON_DOCS = [
  "PAN of the business / applicant",
  "Aadhaar of proprietor / partners / directors",
  "Passport-size photograph of authorised signatory",
  "Proof of principal place of business (electricity bill / rent agreement + NOC)",
  "Bank account proof (cancelled cheque / statement / passbook)",
  "Authorisation letter / board resolution for the authorised signatory",
];

const GST_TYPES: RegistrationType[] = [
  {
    key: "voluntary",
    title: "Voluntary Registration",
    short: "Voluntary",
    form: "REG-01",
    tags: ["Optional", "Claim ITC"],
    blurb: "Register by choice even when you're below the turnover threshold.",
    about:
      "Voluntary GST registration lets a business register under GST even when it isn't required to by law. Businesses below the turnover threshold often register voluntarily to claim input tax credit, look compliant to larger buyers, and sell across state lines or on e-commerce platforms.\n\nOnce registered, all the normal GST obligations — returns, tax-compliant invoicing and timely tax payment — apply just as they would to a regular taxpayer.",
    who: [
      "Any person not otherwise liable to register who opts in voluntarily.",
      "Businesses below the threshold turnover that want to claim input tax credit.",
      "Suppliers who need a GSTIN to sell to registered businesses or on tenders.",
    ],
    docs: [...COMMON_DOCS, "Proof of business constitution (partnership deed / incorporation certificate, if applicable)"],
  },
  {
    key: "regular",
    title: "Normal / Regular Taxpayer",
    short: "Regular",
    form: "REG-01",
    tags: ["Most common", "Full ITC"],
    popular: true,
    blurb: "Standard registration for businesses crossing the turnover threshold.",
    about:
      "The normal / regular taxpayer registration is the standard GST registration for businesses that cross the prescribed turnover threshold or otherwise make taxable supplies. A regular taxpayer collects GST from customers, claims input tax credit on eligible purchases, and files periodic returns.\n\nThis is the most common category and suits the majority of trading, manufacturing and service businesses.",
    who: [
      "Aggregate turnover above ₹40 lakh (goods) or ₹20 lakh (services).",
      "₹20 lakh / ₹10 lakh threshold for special-category states.",
      "Anyone making regular taxable supplies of goods or services.",
    ],
    docs: [...COMMON_DOCS, "Proof of business constitution (partnership deed / incorporation certificate, if applicable)"],
  },
  {
    key: "composition",
    title: "Composition Scheme",
    short: "Composition",
    form: "REG-01 · CMP-02",
    tags: ["Flat rate", "Turnover ≤ ₹1.5 Cr"],
    blurb: "A flat-rate scheme for small taxpayers with simpler compliance.",
    about:
      "The composition scheme is a simplified GST option for small taxpayers. Instead of the regular rates, eligible businesses pay tax at a low flat rate on turnover, file quarterly and enjoy much lighter compliance.\n\nThe trade-off: a composition dealer cannot collect GST from customers or claim input tax credit, and cannot make inter-state supplies or supply through e-commerce operators.",
    who: [
      "Aggregate turnover up to ₹1.5 crore (₹75 lakh for special-category states).",
      "Pay tax at a flat rate; cannot collect tax from customers or claim ITC.",
      "Not available to inter-state suppliers or supplies through e-commerce operators.",
    ],
    docs: [...COMMON_DOCS, "Composition scheme opt-in declaration (Form CMP-02)"],
  },
  {
    key: "casual",
    title: "Casual Taxable Person (CTP)",
    short: "CTP",
    form: "REG-01",
    tags: ["Occasional", "Advance tax"],
    blurb: "For occasional supplies in a state where you have no fixed place of business.",
    about:
      "A casual taxable person occasionally supplies goods or services in a state or union territory where they have no fixed place of business — for example at an exhibition, trade fair or seasonal stall.\n\nRegistration is required before supply begins, and an advance deposit of the estimated tax liability is payable. The registration is valid for up to 90 days and can be extended once.",
    who: [
      "A person who occasionally supplies goods/services where they have no fixed establishment.",
      "Typical for exhibitions, trade fairs and seasonal stalls.",
      "Must deposit advance tax based on estimated liability; valid up to 90 days.",
    ],
    docs: [...COMMON_DOCS, "Estimated turnover & tax liability for the registration period", "Advance tax deposit challan"],
  },
  {
    key: "nrtp",
    title: "Non-Resident Taxable Person (NRTP)",
    short: "NRTP",
    form: "REG-09",
    tags: ["Foreign", "Advance tax"],
    blurb: "For persons based outside India making taxable supplies in India.",
    about:
      "A non-resident taxable person is someone who resides outside India but occasionally supplies goods or services in India without a fixed place of business here.\n\nRegistration is made on Form GST REG-09 at least five days before commencing business, along with an advance deposit of the estimated tax liability for the registration period.",
    who: [
      "A person residing outside India who occasionally supplies goods/services in India.",
      "Has no fixed place of business in India.",
      "Registers via Form REG-09 with an advance tax deposit.",
    ],
    docs: [
      "Passport / tax identification number of the non-resident",
      "Photograph of the authorised signatory",
      "PAN & Aadhaar of the authorised signatory in India",
      "Proof of place of business in India (if any)",
      "Bank account proof",
      "Advance tax deposit challan",
    ],
  },
  {
    key: "isd",
    title: "Input Service Distributor (ISD)",
    short: "ISD",
    form: "REG-01",
    tags: ["Credit distribution"],
    blurb: "Distribute input-service tax credit across branches under the same PAN.",
    about:
      "An Input Service Distributor is an office of a business that receives tax invoices for input services and distributes the eligible input tax credit to its branch units having the same PAN.\n\nISD registration is separate from the normal GST registration and is used purely to allocate common input-service credit across locations.",
    who: [
      "An office of a supplier that receives tax invoices for input services.",
      "Distributes the eligible input tax credit to its branches having the same PAN.",
      "Requires a separate ISD registration in addition to the normal GSTIN.",
    ],
    docs: [...COMMON_DOCS, "Existing GSTIN of the head office", "List of branch GSTINs to distribute credit to"],
  },
  {
    key: "ecommerce",
    title: "E-commerce Operator",
    short: "E-commerce",
    form: "REG-01",
    tags: ["TCS", "Mandatory"],
    blurb: "For platforms that facilitate supply of goods or services online.",
    about:
      "An e-commerce operator owns or manages a digital platform that facilitates the supply of goods or services between other parties.\n\nGST registration is mandatory irrespective of turnover, and the operator must collect Tax Collected at Source (TCS) on the net value of taxable supplies made through the platform.",
    who: [
      "A person who owns or operates a digital platform for supply of goods/services.",
      "Registration is mandatory regardless of turnover.",
      "Required to collect Tax Collected at Source (TCS) on supplies through the platform.",
    ],
    docs: [...COMMON_DOCS, "Website / platform details", "Proof of business constitution (incorporation certificate)"],
  },
  {
    key: "tds_tcs",
    title: "TDS / TCS Deductor or Collector",
    short: "TDS / TCS",
    form: "REG-07",
    tags: ["Deduct / Collect", "TAN"],
    blurb: "For notified deductors of TDS or collectors of TCS under GST.",
    about:
      "Certain notified persons must register as a GST deductor (TDS) or collector (TCS). Government departments, local authorities and specified agencies deduct TDS on payments to suppliers on Form GST REG-07, while e-commerce operators collect TCS.\n\nThis registration is separate from a supplier's regular GSTIN and is keyed to the deductor's TAN.",
    who: [
      "Government departments / notified persons required to deduct TDS under GST.",
      "E-commerce operators required to collect TCS.",
      "Registers via Form REG-07 using the deductor's TAN.",
    ],
    docs: [
      "TAN of the deductor / collector",
      "PAN of the entity",
      "Photograph & ID proof of the Drawing & Disbursing Officer (DDO) / authorised signatory",
      "Proof of office address",
      "Authorisation / appointment order of the authorised signatory",
    ],
  },
  {
    key: "special",
    title: "Special Category / Other Registrations",
    short: "Special",
    form: "REG-01",
    tags: ["OIDAR", "UIN", "SEZ"],
    blurb: "OIDAR providers, UN bodies / embassies (UIN), SEZ units and other special cases.",
    about:
      "Some registrations fall outside the standard categories — OIDAR (online information and database access/retrieval) providers supplying from outside India, UN bodies, embassies and other notified persons obtaining a Unique Identity Number (UIN), and SEZ units or developers.\n\nThese follow special procedures notified under the GST law; a Cloudcrest BM associate will confirm the exact route for your case.",
    who: [
      "OIDAR service providers supplying online services from outside India.",
      "UN bodies, embassies and notified persons applying for a Unique Identity Number (UIN).",
      "SEZ units / developers and other cases notified under the GST law.",
    ],
    docs: [...COMMON_DOCS, "Notification / approval evidencing the special category (SEZ letter, UIN eligibility, etc.)"],
  },
];

export function GstWizard(_props: { initialName?: string }) {
  return (
    <TypePickerPage
      catalogSlug="gst"
      titlePrefix="GST Registration — "
      formDataKey="gstType"
      backLabel="All GST registration types"
      hero={{
        badge: "GSTN · CBIC · GST Registration Desk",
        title: "GST Registration",
        subtitle:
          "Pick the type of GST registration you need. Each opens a full guide — who can apply, the documents you'll need and the fee — before you apply.",
        highlights: [
          { icon: ShieldCheck, label: "Eligibility Guidance" },
          { icon: Zap, label: "Category-wise Documents" },
          { icon: ClipboardList, label: "Guided Application" },
          { icon: FileDown, label: "Tracked Submission" },
        ],
      }}
      picker={{
        eyebrow: "Types of GST registration",
        heading: "Choose a registration type",
        subtitle: "Select a category to see who can apply, the documents required and to start your application.",
      }}
      types={GST_TYPES}
    />
  );
}
