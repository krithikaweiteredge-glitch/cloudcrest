import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import AppShell from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { User, FileText, Receipt, FolderLock, Settings, LogOut } from "lucide-react";
import { ProfileBanner } from "@/components/profile-banner";
import { ConfirmDialog } from "@/components/confirm-dialog";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My Account — Cloudcrest BM" }] }),
  component: ProfileLayout,
});

const NAV: { to: string; label: string; icon: typeof User; exact?: boolean }[] = [
  { to: "/profile", label: "Overview", icon: User, exact: true },
  { to: "/profile/requests", label: "My Registrations", icon: FileText },
  { to: "/profile/orders", label: "Orders & Invoices", icon: Receipt },
  { to: "/profile/documents", label: "Documents Vault", icon: FolderLock },
  { to: "/profile/settings", label: "Account Settings", icon: Settings },
];

function ProfileLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  const { data: profile } = useQuery({
    queryKey: ["profile-layout"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/profiles/me`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    enabled: !!user,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/", replace: true });
  };

  const business = profile?.businesses?.[0];
  // The banner needs email/status; prefer the fetched profile, fall back to the
  // auth session so the header still renders before the profile query resolves.
  const bannerUser = profile?.user ?? {
    email: user?.email ?? undefined,
    phone: user?.phone ?? undefined,
    status: user?.status ?? undefined,
  };

  return (
    <AppShell>
      {/* Fluid width so the page fills whatever the sidebar leaves behind, with a
          cap that keeps line lengths sane on very wide screens. */}
      <div className="w-full max-w-[1600px] mx-auto px-6 md:px-10 py-8 animate-in-up">
        <div className="mb-8">
          <ProfileBanner business={business} user={bannerUser} completion={profile?.profileCompletion ?? 0} />
        </div>

        <div className="grid lg:grid-cols-[220px_1fr] gap-8">
          <aside className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {NAV.map((n) => {
              const active = n.exact ? path === n.to : path.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] whitespace-nowrap transition-all " +
                    (active
                      ? "bg-primary/8 text-foreground font-medium border border-primary/20"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent")
                  }
                >
                  <Icon className={"size-4 " + (active ? "text-primary" : "")} />
                  {n.label}
                </Link>
              );
            })}
            <button
              onClick={() => setConfirmSignOut(true)}
              className="mt-2 flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-destructive hover:bg-destructive/10 transition-colors border border-transparent"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </aside>

          <section className="min-w-0">
            <Outlet />
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out of Cloudcrest?"
        message="You'll need to sign in again to access your dashboard, applications and documents."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        destructive
        onConfirm={async () => {
          setConfirmSignOut(false);
          await handleSignOut();
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </AppShell>
  );
}
