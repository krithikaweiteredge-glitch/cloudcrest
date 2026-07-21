import { createFileRoute } from "@tanstack/react-router";
import AppShell from "@/components/app-shell";
import { ModulePage } from "@/components/module-page";
import { getModule } from "@/lib/modules";

interface ServiceSearch {
  name?: string;
}

export const Route = createFileRoute("/m/$slug")({
  validateSearch: (search: Record<string, unknown>): ServiceSearch => {
    return {
      name: search.name ? String(search.name) : undefined,
    };
  },
  head: ({ params }) => {
    const m = getModule(params.slug);
    const title = m ? `${m.title} — Cloudcrest BM` : "Module — Cloudcrest BM";
    return {
      meta: [
        { title },
        { name: "description", content: m ? `${m.title} desk. ${m.authority} · ${m.form ?? ""}` : "Compliance module" },
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
