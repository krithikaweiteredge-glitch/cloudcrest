import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { fetchCurrentUser } from "@/lib/auth-api";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Authoritative check — the backend validates the session cookie and re-reads
    // the user's role and status from the DB on every call.
    const user = await fetchCurrentUser();
    if (!user) {
      throw redirect({ to: "/auth", search: { next: location.pathname } });
    }
    return { user };
  },
  component: () => <Outlet />,
});
