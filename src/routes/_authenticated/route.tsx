import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { fetchCurrentUser } from "@/lib/auth-api";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Authoritative check — the backend validates the session cookie and re-reads
    // the user's role and status from the DB on every call.
    const user = await fetchCurrentUser();
    if (!user) {
      // Staff hitting an admin-area path get the admin login (email + password),
      // since the Admin tab is no longer shown on the customer sign-in page.
      const isAdminArea = location.pathname.startsWith("/admin");
      throw redirect({
        to: "/auth",
        search: isAdminArea
          ? { admin: true, next: location.pathname }
          : { next: location.pathname },
      });
    }
    return { user };
  },
  component: () => <Outlet />,
});
