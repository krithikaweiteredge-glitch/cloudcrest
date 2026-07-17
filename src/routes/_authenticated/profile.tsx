import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import AppShell from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { User, FileText, Receipt, FolderLock, Settings, LogOut, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My Account — Cloudcrest BM" }] }),
  component: ProfileLayout,
});

const NAV = [
  { to: "/profile", label: "Overview", icon: User, exact: true },
  { to: "/profile/requests", label: "My Registrations", icon: FileText },
  { to: "/profile/orders", label: "Orders & Invoices", icon: Receipt },
  { to: "/profile/documents", label: "Documents Vault", icon: FolderLock },
  { to: "/profile/settings", label: "Account Settings", icon: Settings },
] as const;

function ProfileLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/", replace: true });
  };

  const initial = (user?.email ?? user?.phone ?? "U").charAt(0).toUpperCase();

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 animate-in-up">
        <div className="flex items-center gap-4 mb-8">
          <div className="size-14 rounded-full gradient-brand text-white grid place-items-center text-xl font-semibold shadow-brand">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="label-eyebrow text-primary">My Account</div>
            <h1 className="text-2xl font-display font-semibold truncate">
              {user?.email ?? user?.phone ?? "Welcome"}
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] mono text-muted-foreground mt-0.5">
              <ShieldCheck className="size-3 text-success" /> Verified · ID {user?.id.slice(0, 8)}
            </div>
          </div>
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
              onClick={handleSignOut}
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
    </AppShell>
  );
}
