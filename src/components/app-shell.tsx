import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Phone, Mail, Search, Bell, ChevronRight, Sparkles, User, LogIn, LogOut, FileText, Receipt, Settings as SettingsIcon } from "lucide-react";
import { MODULE_GROUPS } from "@/lib/modules";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/cloudcrest-logo.png";

export default function AppShell({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeSlug = pathname.startsWith("/m/") ? pathname.split("/")[2] : "company";

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col">
      {/* Top utility strip (navy) */}
      <div className="bg-navy text-navy-foreground">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between px-6 h-11 text-xs">
          <div className="flex items-center gap-2">
            <span className="mono uppercase tracking-widest text-[10px] text-navy-foreground/60">
              Cloudcrest BM · Compliance Ops
            </span>
            <span className="hidden sm:inline text-navy-foreground/30">/</span>
            <span className="hidden sm:inline text-navy-foreground/70">
              Business Management Private Limited
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="tel:+918977079433" className="flex items-center gap-1.5 text-navy-foreground/80 hover:text-primary transition-colors">
              <Phone className="size-3" /> <span className="mono">+91 89770 79433</span>
            </a>
            <a href="mailto:cloudcrestbm@gmail.com" className="hidden md:flex items-center gap-1.5 text-navy-foreground/80 hover:text-primary transition-colors">
              <Mail className="size-3" /> cloudcrestbm@gmail.com
            </a>
          </div>
        </div>
      </div>

      {/* Main app row */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-72 flex-shrink-0 bg-surface border-r border-border flex flex-col sticky top-0 h-screen self-start">
          <Link
            to="/"
            className="h-16 flex items-center gap-2 px-4 border-b border-border group"
          >
            <img
              src={logo}
              alt="Cloudcrest BM"
              className="h-9 w-auto object-contain transition-transform group-hover:scale-[1.02]"
            />
            <div className="leading-tight ml-1">
              <div className="text-[11px] mono text-muted-foreground tracking-widest uppercase">
                Registration Desk
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="size-1.5 rounded-full bg-success live-dot" />
                <span className="text-[10px] mono text-success">Live · advisors online</span>
              </div>
            </div>
          </Link>

          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-muted/70 border border-border focus-within:ring-2 focus-within:ring-primary/25 focus-within:border-primary transition-all">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                className="bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none flex-1"
                placeholder="Search 22 modules…"
              />
              <kbd className="text-[9px] mono text-muted-foreground border border-border rounded px-1 py-0.5">
                ⌘K
              </kbd>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
            {MODULE_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="label-eyebrow px-2 mb-2 flex items-center justify-between">
                  <span>{group.label}</span>
                  <span className="mono text-[9px] text-muted-foreground/60">
                    {group.items.length.toString().padStart(2, "0")}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {group.items.map((m) => {
                    const active = m.slug === activeSlug;
                    const Icon = m.icon;
                    return (
                      <li key={m.slug}>
                        <Link
                          to="/m/$slug"
                          params={{ slug: m.slug }}
                          className={
                            "group relative flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-all " +
                            (active
                              ? "bg-primary/8 text-foreground font-medium"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground")
                          }
                        >
                          {active && (
                            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />
                          )}
                          <Icon
                            className={
                              "size-3.5 transition-colors " +
                              (active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")
                            }
                          />
                          <span className="flex-1 truncate">{m.short}</span>
                          <ChevronRight
                            className={
                              "size-3 transition-all " +
                              (active
                                ? "text-primary opacity-100"
                                : "text-muted-foreground/40 opacity-0 group-hover:opacity-100")
                            }
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="p-4 border-t border-border">
            <div className="rounded-lg border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-3.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="size-3 text-primary" />
                <div className="label-eyebrow text-primary">Advisor on Call</div>
              </div>
              <div className="text-sm font-semibold mono">+91 89770 79433</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Mon–Sat · 10:00–19:00 IST
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-16 border-b border-border bg-surface/85 backdrop-blur sticky top-0 z-10 flex items-center justify-between px-8">
            <nav className="flex items-center text-[13px] gap-1.5">
              <span className="text-muted-foreground">Workspace</span>
              <ChevronRight className="size-3 text-muted-foreground/60" />
              <span className="text-foreground font-medium">
                Registration &amp; Compliance
              </span>
            </nav>
            <div className="flex items-center gap-3">
              <button className="size-8 rounded-full bg-surface border border-border grid place-items-center relative hover:bg-muted transition-colors">
                <Bell className="size-3.5 text-muted-foreground" />
                <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary live-dot" />
              </button>
              <AccountMenu />
            </div>
          </header>

          <div className="flex-1 min-w-0">{children ?? <Outlet />}</div>
        </main>
      </div>
    </div>
  );
}

function AccountMenu() {
  const { user, signOut, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (loading) {
    return <div className="size-8 rounded-full bg-muted animate-pulse" />;
  }

  if (!user) {
    return (
      <Link
        to="/auth"
        className="flex items-center gap-1.5 h-8 px-3.5 rounded-md gradient-brand text-white text-xs font-semibold shadow-brand"
      >
        <LogIn className="size-3.5" /> Sign in
      </Link>
    );
  }

  const initial = (user.email ?? user.phone ?? "U").charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="size-8 rounded-full gradient-brand text-white grid place-items-center text-sm font-semibold shadow-brand hover:shadow-elev transition-all"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-64 rounded-xl border border-border bg-surface shadow-elev overflow-hidden z-20 animate-in-up">
          <div className="p-3 border-b border-border">
            <div className="text-[11px] mono uppercase text-muted-foreground">Signed in as</div>
            <div className="text-sm font-medium truncate">{user.email ?? user.phone}</div>
          </div>
          <div className="p-1.5">
            {[
              { to: "/profile", icon: User, label: "Overview" },
              { to: "/profile/requests", icon: FileText, label: "My Registrations" },
              { to: "/profile/orders", icon: Receipt, label: "Orders & Invoices" },
              { to: "/profile/settings", icon: SettingsIcon, label: "Account Settings" },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <Link
                  key={m.to}
                  to={m.to as "/profile"}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] hover:bg-muted"
                >
                  <Icon className="size-3.5 text-muted-foreground" />
                  {m.label}
                </Link>
              );
            })}
          </div>
          <div className="border-t border-border p-1.5">
            <button
              onClick={async () => {
                await signOut();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-destructive hover:bg-destructive/10"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
