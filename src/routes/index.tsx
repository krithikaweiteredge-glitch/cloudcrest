import { createFileRoute } from "@tanstack/react-router";
import AppShell from "@/components/app-shell";
import { ModulePage } from "@/components/module-page";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cloudcrest BM — Business Registration & Compliance Wizard" },
      { name: "description", content: "Enterprise-grade workspace for company, LLP, tax, labour, municipal, industry and IP registrations across India." },
      { property: "og:title", content: "Cloudcrest BM — Compliance Operations" },
      { property: "og:description", content: "MCA, GST, Labour, Municipal & IP registration desk with real validations, dynamic fees and document checklists." },
    ],
  }),
  component: () => (
    <AppShell>
      <ModulePage slug="company" />
    </AppShell>
  ),
});
