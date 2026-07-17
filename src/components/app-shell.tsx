import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Phone, Mail, Search, Bell, ChevronRight } from "lucide-react";
import { MODULE_GROUPS } from "@/lib/modules";
import type { ReactNode } from "react";

export default function AppShell({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeSlug = pathname.startsWith("/m/") ? pathname.split("/")[2] : "company";

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 border-r border-border bg-surface flex flex-col">
        <Link
          to="/"
          className="h-16 flex items-center gap-3 px-5 border-b border-border"
        >
          <div className="size-9 rounded-md bg-brand grid place-items-center text-brand-foreground font-bold tracking-tight">
            CB
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Cloudcrest BM</div>
            <div className="text-[10px] mono text-muted-foreground">
              COMPLIANCE OPS · v4
            </div>
          </div>
        </Link>

        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 h-9 px-3 rounded-md bg-muted/60 border border-border">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              className="bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none flex-1"
              placeholder="Search modules, forms…"
            />
            <kbd className="text-[9px] mono text-muted-foreground border border-border rounded px-1 py-0.5">
              ⌘K
            </kbd>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {MODULE_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="label-eyebrow px-2 mb-1.5">{group.label}</div>
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
                          "group flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors " +
                          (active
                            ? "bg-panel text-foreground border-l-2 border-brand pl-1.5"
                            : "text-muted-foreground hover:bg-panel/60 hover:text-foreground")
                        }
                      >
                        <Icon
                          className={
                            "size-3.5 " +
                            (active ? "text-brand" : "text-muted-foreground")
                          }
                        />
                        <span className="flex-1 truncate">{m.short}</span>
                        {active && (
                          <span className="text-[9px] mono text-brand">
                            ACTIVE
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="rounded-md border border-border bg-panel/60 p-3">
            <div className="label-eyebrow mb-1">Advisor Hotline</div>
            <div className="text-sm font-medium mono">+91 89770 79433</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              cloudcrestbm@gmail.com
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-surface/60 backdrop-blur flex items-center justify-between px-8">
          <nav className="flex items-center text-[13px] gap-1.5">
            <span className="text-muted-foreground">Workspace</span>
            <ChevronRight className="size-3 text-muted-foreground/60" />
            <span className="text-foreground font-medium">
              Registration & Compliance
            </span>
          </nav>
          <div className="flex items-center gap-5">
            <div className="hidden md:flex items-center gap-4 text-[11px] mono text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Phone className="size-3" /> +91 89770 79433
              </span>
              <span className="flex items-center gap-1.5">
                <Mail className="size-3" /> cloudcrestbm@gmail.com
              </span>
            </div>
            <button className="size-8 rounded-full bg-panel border border-border grid place-items-center relative">
              <Bell className="size-3.5 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-brand" />
            </button>
            <div className="size-8 rounded-full bg-panel border border-border grid place-items-center text-[10px] mono font-semibold">
              CB
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">{children ?? <Outlet />}</div>
      </main>
    </div>
  );
}
