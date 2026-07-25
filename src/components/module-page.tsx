import { CompanyWizard } from "@/components/company-wizard";
import { LlpWizard } from "@/components/llp-wizard";
import { ServiceDetailPage } from "@/components/service-detail-page";

export function ModulePage({ slug, initialName }: { slug: string; initialName?: string }) {
  // Company and LLP keep their bespoke multi-step incorporation wizards. The LLP
  // flow has no entity-type step — a single LLP structure exists, so it opens on
  // the name step. Every other service, including anything an admin publishes,
  // renders the catalog-driven tabbed page.
  if (slug === "company") return <CompanyWizard initialName={initialName} />;
  if (slug === "llp") return <LlpWizard initialName={initialName} />;
  return <ServiceDetailPage slug={slug} />;
}
