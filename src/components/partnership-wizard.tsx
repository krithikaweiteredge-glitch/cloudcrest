import { TypePickerPage, type RegistrationType } from "@/components/type-picker-page";
import { ShieldCheck, ScrollText, ClipboardList, FileDown } from "lucide-react";

/**
 * Partnership firm entry point. The applicant chooses between a Registered and
 * an Unregistered partnership firm — shown as cards, like the GST categories.
 * Selecting one opens the standard tabbed service page (About / Who can apply /
 * Documents / Acts & Rules + Start Application) for that choice, and the choice
 * is recorded on the request (`partnershipType`) so the customer and admin both
 * see which kind of partnership was applied for.
 */

// Documents common to both — each type layers on its specifics.
const COMMON_DOCS = [
  "PAN of the firm (or Form 49A application)",
  "PAN & Aadhaar of all partners",
  "Passport-size photographs of all partners",
  "Partnership deed executed on stamp paper",
  "Proof of principal place of business (electricity bill / rent agreement + NOC)",
  "Bank account proof (cancelled cheque / statement / passbook)",
];

const PARTNERSHIP_TYPES: RegistrationType[] = [
  {
    key: "registered",
    title: "Registered Partnership Firm",
    short: "Registered",
    form: "Form 1 · Registrar of Firms",
    tags: ["Legally enforceable", "Registrar of Firms"],
    popular: true,
    blurb: "Registered with the Registrar of Firms for full legal standing.",
    about:
      "A registered partnership firm is registered with the Registrar of Firms under the Indian Partnership Act, 1932. Registration is optional under the Act, but it gives the firm important legal standing.\n\nA registered firm — and its partners — can sue third parties and each other to enforce contractual rights, and can claim set-off in disputes. These rights are not available to an unregistered firm, so most firms that expect to deal at scale choose to register.",
    who: [
      "Two or more persons who have agreed to carry on a business and share its profits.",
      "Firms that want the legal enforceability and credibility registration provides.",
      "All partners must be competent to contract (major, of sound mind, not disqualified).",
    ],
    docs: [
      ...COMMON_DOCS,
      "Application for registration to the Registrar of Firms (Form 1)",
      "Affidavit / statement signed by all partners",
      "Prescribed registration fee challan",
    ],
  },
  {
    key: "unregistered",
    title: "Unregistered Partnership Firm",
    short: "Unregistered",
    form: "Partnership Deed",
    tags: ["Quick setup", "Lower cost"],
    blurb: "Formed on a partnership deed without filing with the Registrar of Firms.",
    about:
      "An unregistered partnership firm is created by executing a partnership deed but is not registered with the Registrar of Firms. It is quick and inexpensive to set up and is perfectly legal to operate.\n\nThe limitation is legal enforceability: an unregistered firm cannot file suit to enforce contractual rights against third parties or between partners, and cannot claim set-off in certain disputes. Many firms start unregistered and register later to gain these rights.",
    who: [
      "Two or more persons starting a business together who want a quick, low-cost structure.",
      "Firms that intend to register with the Registrar of Firms later.",
      "Those who don't immediately need to enforce contractual rights through the courts.",
    ],
    docs: [...COMMON_DOCS, "Notarised partnership deed"],
  },
];

export function PartnershipWizard(_props: { initialName?: string }) {
  return (
    <TypePickerPage
      catalogSlug="partnership"
      titlePrefix="Partnership Registration — "
      formDataKey="partnershipType"
      backLabel="All partnership types"
      hero={{
        badge: "Registrar of Firms · Indian Partnership Act, 1932",
        title: "Partnership Registration",
        subtitle:
          "Choose a registered or unregistered partnership. Each opens a full guide — who can apply, the documents you'll need and the fee — before you apply.",
        highlights: [
          { icon: ShieldCheck, label: "Right Structure Guidance" },
          { icon: ScrollText, label: "Deed & Documents" },
          { icon: ClipboardList, label: "Guided Application" },
          { icon: FileDown, label: "Tracked Submission" },
        ],
      }}
      picker={{
        eyebrow: "Types of partnership",
        heading: "Choose a partnership type",
        subtitle: "Select registered or unregistered to see who can apply, the documents required and to start your application.",
      }}
      types={PARTNERSHIP_TYPES}
    />
  );
}
