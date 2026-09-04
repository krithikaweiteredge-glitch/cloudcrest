import { EntityStateWizard, type StateWizardType } from "@/components/entity-state-wizard";
import { ShieldCheck, ScrollText, ClipboardList, FileDown, FileCheck2, FileText } from "lucide-react";

/**
 * Partnership firm entry point. The applicant first chooses between a Registered
 * and an Unregistered partnership firm, then the state — mirroring the Society
 * flow (type → state). Each (type × state) combination opens the standard tabbed
 * service page (About / Who can apply / Documents / Acts & Rules + Start
 * Application) authored per state by the admin, and the choices are recorded on
 * the request (`partnershipType`, `state`) so the customer and admin both see
 * which kind of partnership, and where, was applied for.
 */
const PARTNERSHIP_TYPES: StateWizardType[] = [
  {
    key: "registered",
    slug: "partnership-registered",
    title: "Registered Partnership Firm",
    note: "Registered with the Registrar of Firms for full legal standing.",
    icon: FileCheck2,
    recommended: true,
  },
  {
    key: "unregistered",
    slug: "partnership-unregistered",
    title: "Unregistered Partnership Firm",
    note: "Formed on a partnership deed without filing with the Registrar of Firms.",
    icon: FileText,
  },
];

export function PartnershipWizard(_props: { initialName?: string }) {
  return (
    <EntityStateWizard
      config={{
        baseSlug: "partnership",
        baseTitle: "Partnership Registration",
        typeFormDataKey: "partnershipType",
        types: PARTNERSHIP_TYPES,
        changeLabel: "Change type",
        hero: {
          eyebrow: "Registrar of Firms · Indian Partnership Act, 1932",
          title: "Partnership Registration",
          subtitle:
            "Choose a registered or unregistered partnership and your state. Each opens a full guide — who can apply, the documents you'll need and the fee — before you apply.",
          highlights: [
            { icon: ShieldCheck, label: "Right Structure Guidance" },
            { icon: ScrollText, label: "Deed & Documents" },
            { icon: ClipboardList, label: "Guided Application" },
            { icon: FileDown, label: "Tracked Submission" },
          ],
        },
        typeStep: {
          eyebrow: "Step 1 · Partnership type",
          heading: "Choose a partnership type",
          subtitle: "Select registered or unregistered, then pick your state.",
        },
        stateStep: {
          subtitle: "Partnership registration is handled state-wise.",
        },
      }}
    />
  );
}
