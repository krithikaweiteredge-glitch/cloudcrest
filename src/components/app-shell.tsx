import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Phone, Mail, Search, Bell, ChevronRight, ChevronLeft, ChevronDown, Sparkles, User, LogIn, LogOut, FileText, Receipt, Settings as SettingsIcon, ShieldAlert, LifeBuoy, FolderTree } from "lucide-react";
import { useCatalogGroups } from "@/lib/service-catalog";
import { SupportFab } from "@/components/support-fab";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ConfirmDialog } from "@/components/confirm-dialog";
import logo from "@/assets/cloudcrest-logo.png";

export default function AppShell({ children }: { children?: ReactNode }) {
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const isAdmin = useAuth().isAdmin;
  // In the admin console the sidebar filters registrations by service instead of
  // opening the customer wizard, and the active item comes from the `service` param.
  const isAdminView = pathname.startsWith("/admin");
  // An admin picking a service anywhere should land on that service's
  // registrations, not the customer-facing page.
  const linkToAdmin = isAdminView || isAdmin;
  // Empty on non-service pages (home, profile, …) so nothing in the sidebar is
  // highlighted and no group is auto-expanded there.
  const activeSlug = isAdminView
    ? ((location.search as { service?: string })?.service ?? "")
    : pathname.startsWith("/m/")
    ? pathname.split("/")[2]
    : "";

  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Services come from the backend catalog; the built-in list is only a fallback
  // so the sidebar still renders if the API is unreachable. Shared with the home
  // page so a newly published service appears in both.
  const { groups } = useCatalogGroups();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Derived from the live catalog rather than the built-in list, so a category
  // an admin creates gets an entry here too — without one it would always read
  // as closed. Opens the group holding the current service, else the first.
  useEffect(() => {
    if (groups.length === 0) return;
    const activeGroup = groups.find((g) => g.items.some((item) => item.slug === activeSlug));
    // No active service (home / profile / admin overview) → leave the groups as the
    // user left them instead of force-opening the first one.
    if (!activeGroup) return;
    setOpenGroups(Object.fromEntries(groups.map((g) => [g.label, g.label === activeGroup.label])));
  }, [activeSlug, groups]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const isCurrentlyOpen = !!prev[label];
      const next: Record<string, boolean> = {};
      groups.forEach((g) => {
        next[g.label] = false;
      });
      next[label] = !isCurrentlyOpen;
      return next;
    });
  };

  const filteredGroups = groups.map((g) => {
    if (!searchQuery.trim()) return g;
    const q = searchQuery.toLowerCase();
    const filteredItems = g.items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.short.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q) ||
        g.label.toLowerCase().includes(q)
    );
    return { ...g, items: filteredItems };
  }).filter((g) => g.items.length > 0);

  /**
   * The collapsed rail shows a fixed five icons rather than the whole catalog —
   * 25+ stacked icons is an unreadable strip. The active service is always one
   * of them, swapped into the last slot when it isn't already in the top five,
   * so the rail still shows where you are.
   */
  const RAIL_LIMIT = 5;
  const railItems = (() => {
    const all = groups.flatMap((g) => g.items);
    const top = all.slice(0, RAIL_LIMIT);
    if (!activeSlug || top.some((m) => m.slug === activeSlug)) return top;
    const active = all.find((m) => m.slug === activeSlug);
    return active ? [...top.slice(0, RAIL_LIMIT - 1), active] : top;
  })();

  return (
    <div className="min-h-screen w-full text-foreground flex flex-col">
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

      {/* Top header — the brand block lives here so it stays put when the sidebar collapses */}
      <header className="h-16 border-b border-border bg-surface/80 backdrop-blur-xl sticky top-0 z-20 flex items-center justify-between pl-4 pr-8 gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <Link to="/" className="flex items-center gap-2 group shrink-0">
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

          <nav className="hidden md:flex items-center text-[13px] gap-1.5 min-w-0">
            <Link to="/" className="text-muted-foreground hover:text-primary transition-colors shrink-0">
              Workspace
            </Link>
            <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" />
            <span className="text-foreground font-medium truncate">
              {(() => {
                const item = groups.flatMap((g) => g.items).find((i) => i.slug === activeSlug);
                if (item) return item.title;
                if (pathname.startsWith("/profile")) return "My Account";
                if (pathname.startsWith("/admin")) return "Admin Console";
                return "Registration & Compliance";
              })()}
            </span>
          </nav>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <NotificationMenu />
          <AccountMenu />
        </div>
      </header>

      {/* Main app row */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside
          className={
            "relative z-30 flex-shrink-0 bg-surface border-r border-border flex flex-col sticky top-16 h-[calc(100vh-4rem)] self-start transition-[width] duration-200 " +
            (sidebarCollapsed ? "w-16" : "w-72")
          }
        >
          {/* Collapse / expand handle — a tab attached to the sidebar's right edge */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute top-0 right-0 translate-x-full z-40 h-11 w-4 rounded-br-md border border-l-0 border-t-0 border-border bg-surface shadow-card grid place-items-center text-muted-foreground hover:text-primary hover:bg-muted transition-colors cursor-pointer"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="size-3" />
            ) : (
              <ChevronLeft className="size-3" />
            )}
          </button>

          {sidebarCollapsed ? (
            /* Collapsed rail — a short icon-only shortcut list. Expanding the
               sidebar is the way to reach the full catalog. */
            <nav className="flex-1 overflow-y-auto py-3 flex flex-col items-center gap-1">
              {railItems.map((m) => {
                const active = m.slug === activeSlug;
                const Icon = m.icon;
                const railClass =
                  "size-9 rounded-lg grid place-items-center transition-all duration-200 " +
                  (active
                    ? "bg-primary/20 text-primary shadow-[0_0_12px_-2px_var(--primary)] scale-105"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-105");
                return linkToAdmin ? (
                  <Link key={m.slug} to="/admin" search={{ service: m.slug }} className={railClass} title={m.title}>
                    <Icon className="size-4" />
                  </Link>
                ) : (
                  <Link key={m.slug} to="/m/$slug" params={{ slug: m.slug }} className={railClass} title={m.title}>
                    <Icon className="size-4" />
                  </Link>
                );
              })}
            </nav>
          ) : (
          <>
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-muted/70 border border-border focus-within:ring-2 focus-within:ring-primary/25 focus-within:border-primary transition-all">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                className="bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none flex-1"
                placeholder="Search modules…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-[10px] text-muted-foreground hover:text-foreground px-1"
                >
                  ✕
                </button>
              ) : (
                <kbd className="text-[9px] mono text-muted-foreground border border-border rounded px-1 py-0.5">
                  ⌘K
                </kbd>
              )}
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-2">
            {filteredGroups.map((group, gi) => {
              const isOpen = searchQuery.trim() ? true : !!openGroups[group.label];
              const hasActiveChild = group.items.some((m) => m.slug === activeSlug);

              return (
                <div key={group.label} className="nav-in" style={{ "--i": gi } as React.CSSProperties}>
                  {/* Section heading — flat, no card */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-left transition-colors cursor-pointer select-none hover:bg-muted/50"
                  >
                    <span
                      className={
                        "flex-1 min-w-0 truncate text-[11.5px] font-bold uppercase tracking-[0.12em] transition-colors " +
                        (hasActiveChild ? "text-primary" : "text-foreground")
                      }
                    >
                      {group.label}
                    </span>
                    <span className="mono text-[9px] text-muted-foreground/60 tabular-nums">
                      {group.items.length.toString().padStart(2, "0")}
                    </span>
                    <ChevronDown
                      className={
                        "size-3.5 shrink-0 transition-transform duration-300 " +
                        (isOpen
                          ? "rotate-180 " + (hasActiveChild ? "text-primary" : "text-foreground/60")
                          : "text-muted-foreground/60")
                      }
                    />
                  </button>

                  {/* Items — animate open/closed via grid rows */}
                  <div
                    className={
                      "grid transition-[grid-template-rows,opacity] duration-300 ease-out " +
                      (isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")
                    }
                  >
                    <ul className="overflow-hidden space-y-px pb-1">
                      {group.items.map((m) => {
                        const active = m.slug === activeSlug;
                        const Icon = m.icon;
                        const linkClass =
                          "group relative flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-md text-[14.5px] transition-all duration-200 " +
                          (active
                            ? "text-primary font-semibold bg-primary/10 translate-x-0.5"
                            : "text-foreground font-medium hover:bg-muted/70 hover:translate-x-0.5");
                        const linkInner = (
                          <>
                            {active && (
                              <span className="nav-rail-glow absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-primary" />
                            )}
                            <Icon
                              className={
                                "size-4 flex-shrink-0 transition-colors " +
                                (active ? "text-primary" : "text-foreground/60 group-hover:text-primary")
                              }
                            />
                            <span className="flex-1 truncate">{m.short}</span>
                            <ChevronRight
                              className={
                                "size-3 shrink-0 transition-all " +
                                (active
                                  ? "text-primary opacity-100"
                                  : "text-muted-foreground/40 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0")
                              }
                            />
                          </>
                        );
                        return (
                          <li key={m.slug}>
                            {linkToAdmin ? (
                              <Link to="/admin" search={{ service: m.slug }} className={linkClass}>
                                {linkInner}
                              </Link>
                            ) : (
                              <Link to="/m/$slug" params={{ slug: m.slug }} className={linkClass}>
                                {linkInner}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="p-4 border-t border-border">
            <div className="card-sheen rounded-lg border border-primary/20 bg-gradient-to-br from-primary/8 to-accent/8 p-3.5">
              <span className="card-sheen-layer" />
              <div className="relative flex items-center gap-1.5 mb-1.5">
                <Sparkles className="size-3 text-primary" />
                <div className="label-eyebrow text-primary">Advisor on Call</div>
              </div>
              <div className="relative text-sm font-semibold mono text-foreground">+91 89770 79433</div>
              <div className="relative text-[11px] text-muted-foreground mt-0.5">
                Mon–Sat · 10:00–19:00 IST
              </div>
            </div>
          </div>
          </>
          )}
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-w-0">{children ?? <Outlet />}</div>
        </main>
      </div>

      {/* Floating support ticket widget — hidden inside the admin console, since
          admins answer tickets rather than raise them. */}
      {!isAdminView && <SupportFab />}
    </div>
  );
}

// Shared admin-role check. The role comes straight from the session user, which
// `useAuth` already resolves against the backend — no second /api/auth/me call.
function useIsAdmin() {
  return useAuth().isAdmin;
}

const READ_NOTIFS_KEY = "cc_read_notifications";

function getReadSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(READ_NOTIFS_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function addToReadSet(ids: (string | number)[]) {
  if (typeof window === "undefined") return;
  try {
    const set = getReadSet();
    ids.forEach((id) => set.add(String(id)));
    localStorage.setItem(READ_NOTIFS_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore storage errors */
  }
}

// Pull the registration reference (?ref=CC-XXXX) out of a notification's linkUrl.
function extractRefFromLink(linkUrl?: string | null): string | null {
  if (!linkUrl || !linkUrl.includes("?")) return null;
  try {
    return new URLSearchParams(linkUrl.split("?")[1]).get("ref");
  } catch {
    return null;
  }
}

function NotificationMenu() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    // Admins don't use the customer notification bell.
    if (isAdmin) return;
    const readSet = getReadSet();
    fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/notifications`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: any[]) => {
        if (Array.isArray(data) && data.length > 0) {
          const formatted = data.map((n) => ({
            id: n.id,
            refNo: n.refNo || extractRefFromLink(n.linkUrl),
            title: n.title,
            text: n.message,
            time: n.createdAt,
            type: n.type || "broadcast",
            linkUrl: n.linkUrl || (user ? "/profile/requests" : "/"),
            // Read if the backend row says so, or we previously marked it read locally.
            isRead: n.isRead === "true" || readSet.has(String(n.id)),
          }));
          // Show unread notifications first (stable — keeps recency order within each group).
          formatted.sort((a, b) => Number(a.isRead) - Number(b.isRead));
          setNotifications(formatted);
          setUnreadCount(formatted.filter((f) => !f.isRead).length);
        } else {
          const fallbackRead = readSet.has("public-1");
          setNotifications([
            {
              id: "public-1",
              title: "📢 Official Announcement: MCA Filing Desk Active",
              text: "SPICe+ Part A & B incorporation forms are now live for FY 2026-27.",
              time: new Date().toISOString(),
              type: "broadcast",
              linkUrl: "/m/company",
              isRead: fallbackRead,
            },
          ]);
          setUnreadCount(fallbackRead ? 0 : 1);
        }
      })
      .catch((err) => console.error("Error fetching notifications:", err));
  }, [user, isAdmin]);

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

  // Persist read state. Every id (numeric, `req-…`, `public-…`) is recorded in
  // localStorage so the read state survives refetches — the derived `req-…` items
  // are regenerated as unread on every fetch, so this is the only way they stick.
  // Real DB notifications (numeric ids) are additionally marked read server-side.
  const persistRead = (id: any) => {
    addToReadSet([id]);
    const isNumeric = typeof id === "number" || (typeof id === "string" && /^\d+$/.test(id));
    if (isNumeric) {
      fetch(`${BACKEND_URL}/api/notifications/${id}/read`, {
        method: "POST",
        credentials: "include",
      }).catch((err) => console.error("Error marking notification read:", err));
    }
  };

  const markOneRead = (n: any) => {
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    setUnreadCount((c) => Math.max(0, c - 1));
    persistRead(n.id);
  };

  const markAllRead = () => {
    notifications.forEach((n) => {
      persistRead(n.id);
    });
    setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setUnreadCount(0);
    fetch(`${BACKEND_URL}/api/notifications/all/read`, {
      method: "POST",
      credentials: "include",
    }).catch((err) => console.error("Error marking all read:", err));
  };

  // Admins manage notifications from the Admin Console, not this bell.
  if (isAdmin) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="size-8 rounded-full bg-surface border border-border grid place-items-center relative hover:bg-muted transition-colors cursor-pointer"
        title="Notifications"
      >
        <Bell className="size-3.5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center shadow-sm animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 sm:w-96 rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden z-30 animate-in fade-in-50 zoom-in-95 duration-150">
          <div className="p-4 border-b border-border/80 bg-muted/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No notifications right now.
              </div>
            ) : (
              notifications.map((n) => {
                const targetUrl = n.linkUrl || (n.refNo ? `/profile/requests?ref=${n.refNo}` : "/profile/requests");
                return (
                  <a
                    key={n.id}
                    href={targetUrl}
                    onClick={(e) => {
                      markOneRead(n);
                      setOpen(false);
                    }}
                    className={
                      "p-3.5 flex items-start gap-3 hover:bg-muted/50 transition-colors block group cursor-pointer " +
                      (n.isRead ? "opacity-60" : "bg-primary/[0.03]")
                    }
                  >
                    <div className="size-8 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0 mt-0.5 relative">
                      <FileText className="size-4" />
                      {!n.isRead && (
                        <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-surface" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {n.title}
                        </span>
                        {n.refNo && (
                          <span className="mono text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-medium shrink-0">
                            {n.refNo}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {n.text}
                      </p>
                      <div className="text-[10px] text-muted-foreground/70 pt-0.5">
                        {n.time ? new Date(n.time).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric" }) : ""}
                      </div>
                    </div>
                  </a>
                );
              })
            )}
          </div>

          <div className="p-2.5 border-t border-border/80 bg-muted/20 text-center">
            <Link
              to="/profile/requests"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              View all registrations <ChevronRight className="size-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const { user, signOut, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
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
            {isAdmin ? (
              <>
                <Link
                  to="/admin"
                  search={{}}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] hover:bg-muted"
                >
                  <FileText className="size-3.5 text-muted-foreground" /> All Registrations
                </Link>
                <Link
                  to="/admin"
                  search={{ view: "tickets" }}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] hover:bg-muted"
                >
                  <LifeBuoy className="size-3.5 text-muted-foreground" /> All Support Tickets
                </Link>
                <Link
                  to="/admin"
                  search={{ view: "notifications" }}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] hover:bg-muted"
                >
                  <Bell className="size-3.5 text-muted-foreground" /> Notification
                </Link>
                <Link
                  to="/admin"
                  search={{ view: "catalog" }}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] hover:bg-muted"
                >
                  <FolderTree className="size-3.5 text-muted-foreground" /> Services
                </Link>
              </>
            ) : (
              [
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
              })
            )}
          </div>
          <div className="border-t border-border p-1.5">
            <button
              onClick={() => {
                setOpen(false);
                setConfirmSignOut(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-destructive hover:bg-destructive/10"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out of Cloudcrest?"
        message="You'll need to sign in again to access your dashboard, applications and documents."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        destructive
        onConfirm={async () => {
          setConfirmSignOut(false);
          await signOut();
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </div>
  );
}
