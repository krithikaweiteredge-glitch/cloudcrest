import { createFileRoute } from "@tanstack/react-router";
import AppShell from "@/components/app-shell";
import { ModulePage } from "@/components/module-page";
import { getModule } from "@/lib/modules";

interface ServiceSearch {
  name?: string;
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
    };
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
  const { name } = Route.useSearch() as ServiceSearch;
  return (
    <AppShell>
      <ModulePage slug={slug} initialName={name} />
    </AppShell>
  );
}
