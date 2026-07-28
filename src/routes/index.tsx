import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import AppShell from "@/components/app-shell";
import { LandingHero } from "@/components/landing-hero";
import { useAuth } from "@/hooks/use-auth";

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
  component: HomeRoute,
});

function HomeRoute() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  // Admins have no customer home page — send them to the admin console instead
  // of ever showing the landing page.
  useEffect(() => {
    if (!loading && isAdmin) navigate({ to: "/admin", replace: true });
  }, [loading, isAdmin, navigate]);

  if (!loading && isAdmin) return null;

  return (
    <AppShell>
      <LandingHero />
    </AppShell>
  );
}

