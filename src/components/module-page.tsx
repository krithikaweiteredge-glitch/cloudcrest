import { CompanyWizard } from "@/components/company-wizard";
import { LlpWizard } from "@/components/llp-wizard";
import { GstWizard } from "@/components/gst-wizard";
import { PartnershipWizard } from "@/components/partnership-wizard";
import { SocietyWizard } from "@/components/society-wizard";
import { HufWizard } from "@/components/huf-wizard";
import { TrustWizard } from "@/components/trust-wizard";
import { SoleProprietorshipWizard } from "@/components/sole-proprietorship-wizard";
import { MsmeModule } from "@/components/msme-wizard";
import { NgoDarpanModule } from "@/components/ngo-darpan-wizard";
import { DepartmentPage } from "@/components/department-page";
import { ServiceDetailPage } from "@/components/service-detail-page";
import { DEPARTMENT_SLUGS } from "@/lib/modules";

export function ModulePage({ slug, initialName }: { slug: string; initialName?: string }) {
  // Company and LLP keep their bespoke multi-step incorporation wizards. GST and
  // Partnership use the category-driven picker (choose a type → see who can apply
  // and the documents for it on the standard service page → apply). Industry
  // departments use the same picker, driven by the catalog family. Every other
  // service, including anything an admin publishes, renders the catalog page.
  if (slug === "company") return <CompanyWizard initialName={initialName} />;
  if (slug === "llp") return <LlpWizard initialName={initialName} />;
  if (slug === "gst") return <GstWizard initialName={initialName} />;
  if (slug === "partnership") return <PartnershipWizard initialName={initialName} />;
  if (slug === "society") return <SocietyWizard />;
  if (slug === "huf") return <HufWizard initialName={initialName} />;
  if (slug === "trust") return <TrustWizard initialName={initialName} />;
  if (slug === "sole-proprietorship") return <SoleProprietorshipWizard initialName={initialName} />;
  if (slug === "msme") return <MsmeModule initialName={initialName} />;
  if (slug === "ngo-darpan") return <NgoDarpanModule initialName={initialName} />;
  if (DEPARTMENT_SLUGS.has(slug)) return <DepartmentPage slug={slug} />;
  return <ServiceDetailPage slug={slug} />;
}
