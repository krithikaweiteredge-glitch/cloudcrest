import { createFileRoute } from "@tanstack/react-router";
import AppShell from "@/components/app-shell";
import { LandingHero } from "@/components/landing-hero";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cloudcrest BM — Register your Indian business, end to end" },
      { name: "description", content: "Search your company name, upload documents, and get MCA, GST, MSME, Trademark and 20+ registrations filed by Cloudcrest BM associates." },
      { property: "og:title", content: "Cloudcrest BM — Business Registration & Compliance" },
      { property: "og:description", content: "One dashboard to register a Company, LLP, GST, MSME, IEC, Trademark and more. Backed by CA/CS professionals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <LandingHero />
    </AppShell>
  ),
});

