import { EntityStateWizard } from "@/components/entity-state-wizard";
import { ShieldCheck, ScrollText, ClipboardList, FileDown } from "lucide-react";

/**
 * Trust registration entry point. State-wise, like the Society flow: pick a state
 * (Telangana / Andhra Pradesh / Karnataka) and open the standard service page for
 * that state, with the state carried onto the request. Content per state is
 * authored by the admin on the `trust-<state>` row (the base `trust` row stays
 * admin-managed as the fallback).
 */
export function TrustWizard(_props: { initialName?: string }) {
  return (
    <EntityStateWizard
      config={{
        baseSlug: "trust",
        baseTitle: "Trust Registration",
        hero: {
          eyebrow: "Charity Commissioner · Indian Trusts Act, 1882",
          title: "Trust Registration",
          subtitle:
            "Register a public or private trust. Choose your state to open a full guide — who can apply, the documents you'll need and the fee — before you apply.",
          highlights: [
            { icon: ShieldCheck, label: "Right Structure Guidance" },
            { icon: ScrollText, label: "Trust Deed & Documents" },
            { icon: ClipboardList, label: "Guided Application" },
            { icon: FileDown, label: "Tracked Submission" },
          ],
        },
        stateStep: {
          subtitle: "Trust registration is handled state-wise.",
        },
      }}
    />
  );
}
