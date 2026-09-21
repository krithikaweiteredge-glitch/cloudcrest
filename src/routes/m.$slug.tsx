import { createFileRoute, redirect } from "@tanstack/react-router";
import AppShell from "@/components/app-shell";
import { ModulePage } from "@/components/module-page";
import { getModule, LEGACY_SLUG_REDIRECTS } from "@/lib/modules";

interface ServiceSearch {
  name?: string;
  /** Company structure picked on the home name check (`pvt`, `public`, `opc`). */
  type?: string;
}

/** `trade-licence` -> `Trade Licence`, used before the service payload arrives. */
function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const Route = createFileRoute("/m/$slug")({
  validateSearch: (search: Record<string, unknown>): ServiceSearch => {
    return {
      name: search.name ? String(search.name) : undefined,
      type: search.type ? String(search.type) : undefined,
    };
  },
  // A service that has been renamed keeps its old URL working: /m/80iac lands
  // on /m/section-140 rather than on an empty page.
  beforeLoad: ({ params, search }) => {
    const renamed = LEGACY_SLUG_REDIRECTS[params.slug];
    if (renamed) {
      throw redirect({ to: "/m/$slug", params: { slug: renamed }, search, replace: true });
    }
  },
  head: ({ params }) => {
    // Built-in modules have static titles. Admin-published services aren't known
    // until the page fetches them, so fall back to a readable slug.
    const m = getModule(params.slug);
    const label = m?.title ?? titleFromSlug(params.slug);
    return {
      meta: [
        { title: `${label} — Cloudcrest BM` },
        {
          name: "description",
          content: m ? `${m.title} desk. ${m.authority} · ${m.form ?? ""}` : `${label} registration desk.`,
        },
      ],
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { slug } = Route.useParams();
  const { name, type } = Route.useSearch() as ServiceSearch;
  return (
    <AppShell>
      <ModulePage slug={slug} initialName={name} initialType={type} />
    </AppShell>
  );
}
