import { EntityStateWizard, type StateWizardType } from "@/components/entity-state-wizard";
import { Building2, Users, ScrollText, ShieldCheck, ClipboardList, FileDown } from "lucide-react";

/**
 * Society registration flow (see "Registration flow for societies"):
 *   1. pick a society type (MACS / Co-operative / general Society),
 *   2. pick a state (Telangana / Andhra Pradesh / Karnataka),
 *   3. Start Application → the standard service page, with the chosen type and
 *      state carried onto the submitted request so the admin sees both.
 * Pricing / documents come from the `society-<type>-<state>` catalog rows
 * (admin-managed). This is the original of the shared state-wise flow now reused
 * by Partnership, Trust, HUF and Sole Proprietorship.
 */
const SOCIETY_TYPES: StateWizardType[] = [
  {
    key: "macs",
    slug: "society-macs",
    title: "Mutually Aided Cooperative Society",
    note: "For Flat Owners / Apartment Associations.",
    icon: Building2,
  },
  {
    key: "coop",
    slug: "society-coop",
    title: "Co-operative Society",
    note: "For general co-operative societies.",
    icon: Users,
  },
  {
    key: "society",
    slug: "society-general",
    title: "Society",
    note: "General society registration under the Societies Registration Act, 1860.",
    icon: ScrollText,
  },
];

export function SocietyWizard() {
  return (
    <EntityStateWizard
      config={{
        baseSlug: "society",
        baseTitle: "Society Registration",
        typeFormDataKey: "societyType",
        types: SOCIETY_TYPES,
        changeLabel: "Change type / state",
        hero: {
          eyebrow: "Registrar of Societies",
          title: "Society Registration",
          subtitle:
            "Choose the society type and your state. Each opens a full guide — who can apply, the documents you'll need and the fee — before you apply.",
          highlights: [
            { icon: ShieldCheck, label: "Right Structure Guidance" },
            { icon: ScrollText, label: "Bye-laws & Documents" },
            { icon: ClipboardList, label: "Guided Application" },
            { icon: FileDown, label: "Tracked Submission" },
          ],
        },
        typeStep: {
          eyebrow: "Step 1 · Society type",
          heading: "Choose a society type",
          subtitle: "Select the structure that fits your society.",
        },
        stateStep: {
          subtitle: "Society registration is handled state-wise.",
        },
      }}
    />
  );
}
