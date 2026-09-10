import { ClosureModule, isClosureSlug } from "@/components/closure-wizard";
import { ConversionModule } from "@/components/conversion-wizard";
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
import { DinModule } from "@/components/din-wizard";
import { IecModule } from "@/components/iec-wizard";
import { LeiModule } from "@/components/lei-wizard";
import { ReraModule } from "@/components/rera-wizard";
import { DscModule } from "@/components/dsc-wizard";
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
  if (slug === "partnership" || slug.startsWith("partnership-")) return <PartnershipWizard initialName={initialName} slug={slug} />;
  if (slug === "society" || slug.startsWith("society-")) return <SocietyWizard initialName={initialName} slug={slug} />;
  if (slug === "huf") return <HufWizard initialName={initialName} />;
  if (slug === "trust" || slug.startsWith("trust-")) return <TrustWizard initialName={initialName} slug={slug} />;
  if (slug === "sole-proprietorship" || slug.startsWith("sole-proprietorship-")) return <SoleProprietorshipWizard initialName={initialName} slug={slug} />;
  if (slug === "msme") return <MsmeModule initialName={initialName} />;
  if (slug === "ngo-darpan") return <NgoDarpanModule initialName={initialName} />;
  if (slug === "din") return <DinModule initialName={initialName} />;
  if (slug === "iec") return <IecModule initialName={initialName} />;
  if (slug === "lei") return <LeiModule initialName={initialName} />;
  if (slug === "rera") return <ReraModule initialName={initialName} />;
  if (slug === "dsc" || slug.startsWith("dsc-")) return <DscModule initialName={initialName} slug={slug} />;
  if (slug.startsWith("conversion-")) return <ConversionModule slug={slug} initialName={initialName} />;
  if (isClosureSlug(slug)) return <ClosureModule slug={slug} initialName={initialName} />;
  if (DEPARTMENT_SLUGS.has(slug)) return <DepartmentPage slug={slug} />;
  return <ServiceDetailPage slug={slug} />;
}
