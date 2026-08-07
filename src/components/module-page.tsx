import { CompanyWizard } from "@/components/company-wizard";
import { LlpWizard } from "@/components/llp-wizard";
import { GstWizard } from "@/components/gst-wizard";
import { PartnershipWizard } from "@/components/partnership-wizard";
import { ServiceDetailPage } from "@/components/service-detail-page";

export function ModulePage({ slug, initialName }: { slug: string; initialName?: string }) {
  // Company and LLP keep their bespoke multi-step incorporation wizards. GST and
  // Partnership use the category-driven picker (choose a type → see who can apply
  // and the documents for it on the standard service page → apply). Every other
  // service, including anything an admin publishes, renders the catalog page.
  if (slug === "company") return <CompanyWizard initialName={initialName} />;
  if (slug === "llp") return <LlpWizard initialName={initialName} />;
  if (slug === "gst") return <GstWizard initialName={initialName} />;
  if (slug === "partnership") return <PartnershipWizard initialName={initialName} />;
  return <ServiceDetailPage slug={slug} />;
}
