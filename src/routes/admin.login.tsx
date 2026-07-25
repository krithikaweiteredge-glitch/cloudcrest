import { createFileRoute, redirect } from "@tanstack/react-router";

// Admin login now lives on the shared /auth page in "admin" mode. This route
// simply redirects there so old links and bookmarks keep working.
export const Route = createFileRoute("/admin/login")({
  beforeLoad: () => {
    throw redirect({ to: "/auth", search: { admin: true }, replace: true });
  },
});
