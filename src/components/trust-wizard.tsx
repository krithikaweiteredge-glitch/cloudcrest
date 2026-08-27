import { EntityStateWizard, type StateWizardType } from "@/components/entity-state-wizard";
import { ShieldCheck, ScrollText, ClipboardList, FileDown, HeartHandshake, Lock } from "lucide-react";

/**
 * Trust registration entry point. The applicant first chooses between a Private
 * and a Public trust, then the state — mirroring the Partnership / Society flow
 * (type → state). Each (type × state) combination opens the standard tabbed
 * service page authored per state by the admin on the `trust-<type>-<state>` row
 * (the `trust-private` / `trust-public` type rows are the fallback, and the base
 * `trust` row stays admin-managed below them). The choices are recorded on the
 * request (`trustType`, `state`) so the customer and admin both see which kind of
 * trust, and where, was applied for.
 */
const TRUST_TYPES: StateWizardType[] = [
  {
    key: "public",
    slug: "trust-public",
    title: "Public Trust",
    note: "Charitable or religious trust for the benefit of the public, registered with the Charity Commissioner.",
    icon: HeartHandshake,
  },
  {
    key: "private",
    slug: "trust-private",
    title: "Private Trust",
    note: "Trust for specific, named beneficiaries (typically family) under the Indian Trusts Act, 1882.",
    icon: Lock,
  },
];

export function TrustWizard(_props: { initialName?: string }) {
  return (
    <EntityStateWizard
      config={{
        baseSlug: "trust",
        baseTitle: "Trust Registration",
        typeFormDataKey: "trustType",
        types: TRUST_TYPES,
        changeLabel: "Change type / state",
        hero: {
          eyebrow: "Charity Commissioner · Indian Trusts Act, 1882",
          title: "Trust Registration",
          subtitle:
            "Choose a public or private trust and your state. Each opens a full guide — who can apply, the documents you'll need and the fee — before you apply.",
          highlights: [
            { icon: ShieldCheck, label: "Right Structure Guidance" },
            { icon: ScrollText, label: "Trust Deed & Documents" },
            { icon: ClipboardList, label: "Guided Application" },
            { icon: FileDown, label: "Tracked Submission" },
          ],
        },
        typeStep: {
          eyebrow: "Step 1 · Trust type",
          heading: "Choose a trust type",
          subtitle: "Select a public or private trust, then pick your state.",
        },
        stateStep: {
          subtitle: "Trust registration is handled state-wise.",
        },
      }}
    />
  );
}
