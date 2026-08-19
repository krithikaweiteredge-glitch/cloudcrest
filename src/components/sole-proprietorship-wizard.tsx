import { EntityStateWizard } from "@/components/entity-state-wizard";
import { ShieldCheck, ScrollText, ClipboardList, FileDown } from "lucide-react";

/**
 * Sole Proprietorship registration entry point. State-wise, like the Society
 * flow: pick a state (Telangana / Andhra Pradesh / Karnataka) and open the
 * standard service page for that state, with the state carried onto the request.
 * Content per state is authored by the admin on the `sole-proprietorship-<state>`
 * row.
 */
export function SoleProprietorshipWizard(_props: { initialName?: string }) {
  return (
    <EntityStateWizard
      config={{
        baseSlug: "sole-proprietorship",
        baseTitle: "Sole Proprietorship Registration",
        hero: {
          eyebrow: "Sole Proprietorship Registration",
          title: "Sole Proprietorship Registration",
          subtitle:
            "Register a sole proprietorship. Choose your state to open a full guide — who can apply, the documents you'll need and the fee — before you apply.",
          highlights: [
            { icon: ShieldCheck, label: "Right Structure Guidance" },
            { icon: ScrollText, label: "Documents Checklist" },
            { icon: ClipboardList, label: "Guided Application" },
            { icon: FileDown, label: "Tracked Submission" },
          ],
        },
        stateStep: {
          subtitle: "Sole proprietorship registration is handled state-wise.",
        },
      }}
    />
  );
}
