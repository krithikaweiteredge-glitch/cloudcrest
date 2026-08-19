import { EntityStateWizard } from "@/components/entity-state-wizard";
import { ShieldCheck, ScrollText, ClipboardList, FileDown } from "lucide-react";

/**
 * HUF (Hindu Undivided Family) registration entry point. State-wise, like the
 * Society flow: pick a state (Telangana / Andhra Pradesh / Karnataka) and open
 * the standard service page for that state, with the state carried onto the
 * request. Content per state is authored by the admin on the `huf-<state>` row.
 */
export function HufWizard(_props: { initialName?: string }) {
  return (
    <EntityStateWizard
      config={{
        baseSlug: "huf",
        baseTitle: "HUF Registration",
        hero: {
          eyebrow: "Income Tax · Hindu Undivided Family",
          title: "HUF Registration",
          subtitle:
            "Register a Hindu Undivided Family. Choose your state to open a full guide — who can apply, the documents you'll need and the fee — before you apply.",
          highlights: [
            { icon: ShieldCheck, label: "Right Structure Guidance" },
            { icon: ScrollText, label: "Deed & Documents" },
            { icon: ClipboardList, label: "Guided Application" },
            { icon: FileDown, label: "Tracked Submission" },
          ],
        },
        stateStep: {
          subtitle: "HUF registration is handled state-wise.",
        },
      }}
    />
  );
}
