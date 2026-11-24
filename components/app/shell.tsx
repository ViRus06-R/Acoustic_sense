"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppProvider, useApp, useMeQuery, type Me } from "./context";
import { NotificationBell } from "./notifications";
import { AccountMenu } from "./account-menu";
import { ErrorBoundary } from "./error-boundary";
import { Icon, Logo, type IconName } from "@/components/ui/icons";
import { cx, Spinner } from "@/components/ui/basic";
import { api } from "@/lib/client/api";
import { ApiError } from "@/lib/client/api";

interface Status {
  broker: { status: "connected" | "reconnecting" | "disconnected" };
  nodesOnline: number;
  openAlerts: number;
}

const NAV: { section: string; admin?: boolean; items: { href: string; label: string; icon: IconName; badge?: boolean; admin?: boolean }[] }[] = [
  {
    section: "MONITORING",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/machines", label: "Machines", icon: "machine" },
      { href: "/alerts", label: "Alerts", icon: "alert", badge: true },
      { href: "/nodes", label: "Nodes", icon: "node" },
      { href: "/reports", label: "Reports", icon: "report" },
    ],
  },
  {
    section: "ADMINISTRATION",
    admin: true,
    items: [
      { href: "/users", label: "Users", icon: "users" },
      { href: "/audit", label: "Audit log", icon: "audit" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];

// Page header (title + subtitle) is set by each page and rendered in the top bar.
const HeaderCtx = createContext<{ set: (h: { title: ReactNode; subtitle?: ReactNode }) => void } | null>(null);
export function usePageHeader(title: ReactNode, subtitle?: ReactNode) {
  const c = useContext(HeaderCtx);
  // Runs after every render of the page so the header always reflects current data.
  // The shell re-render does not re-render the page (children are stable), so this cannot loop.
  useEffect(() => {
    c?.set({ title, subtitle });
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMeQuery();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) {
      const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : pathname;
      router.replace(`/login${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);
    }
  }, [me.error, router, pathname]);

  if (me.isPending || (me.error instanceof ApiError && me.error.status === 401)) {
    return (
      <div className="grid min-h-screen place-items-center text-muted">
        <span className="flex items-center gap-2 text-sm">
          <Spinner /> Loading Acoustic Sense...
        </span>
      </div>
    );
  }
  if (me.error || !me.data) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <p className="text-lg font-semibold">The server is not reachable.</p>
          <p className="mt-1 text-sm text-muted">{(me.error as Error)?.message}</p>
          <button className="mt-4 rounded-[8px] bg-teal px-4 py-2 text-sm font-semibold text-white" onClick={() => me.refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  return (
    <AppProvider me={me.data}>
      <ShellLayout me={me.data}>{children}</ShellLayout>
    </AppProvider>
  );
}

function ShellLayout({ me, children }: { me: Me; children: ReactNode }) {
  const pathname = usePathname();
  const { rt } = useApp();
  const [header, setHeader] = useState<{ title: ReactNode; subtitle?: ReactNode }>({ title: "" });
  // Stable context value: pages consume it, so a new object here would re-render them in a loop.
  const headerCtx = useMemo(() => ({ set: setHeader }), []);
  const [collapsed, setCollapsed] = useState(false);
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/api/system/status"), refetchInterval: 20_000 });

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const brokerState = rt === "connected" && status.data?.broker.status !== "disconnected" ? "connected" : rt === "reconnecting" ? "reconnecting" : "disconnected";

  return (
    <HeaderCtx.Provider value={headerCtx}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="flex min-h-screen">
        <aside className={cx("no-print fixed inset-y-0 left-0 z-40 flex flex-col bg-navy text-white transition-[width]", collapsed ? "w-[68px]" : "w-[220px] max-lg:w-[68px]")} aria-label="Main navigation">
          <div className={cx("flex h-16 items-center px-4", collapsed && "justify-center px-0")}>
            <Link href="/" aria-label="Acoustic Sense home" className="rounded-[8px]">
              <span className={cx(collapsed ? "hidden" : "max-lg:hidden")}>
                <Logo />
              </span>
              <span className={cx(collapsed ? "grid" : "hidden max-lg:grid", "h-9 w-9 place-items-center rounded-lg bg-teal/15 text-teal")}>
                <Icon name="wave" size={20} strokeWidth={2.2} />
              </span>
            </Link>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 pt-2">
            {NAV.filter((s) => !s.admin || me.role === "admin").map((s) => (
              <div key={s.section} className="mb-5">
                <div className={cx("mb-1.5 px-2.5 text-[10.5px] font-bold tracking-[0.12em] text-white/45", collapsed ? "sr-only" : "max-lg:sr-only")}>{s.section}</div>
                <ul className="space-y-0.5">
                  {s.items.map((it) => {
                    const active = isActive(it.href);
                    return (
                      <li key={it.href}>
                        <Link
                          href={it.href}
                          aria-current={active ? "page" : undefined}
                          title={it.label}
                          className={cx(
                            "relative flex h-10 items-center gap-3 rounded-[8px] px-2.5 text-[13.5px] font-medium transition-colors",
                            active ? "bg-navy-3 text-white" : "text-white/70 hover:bg-navy-2 hover:text-white",
                            collapsed && "justify-center px-0",
                          )}
                        >
                          <Icon name={it.icon} size={18} className={active ? "text-teal" : ""} />
                          <span className={cx("flex-1", collapsed ? "sr-only" : "max-lg:sr-only")}>{it.label}</span>
                          {it.badge && (status.data?.openAlerts ?? 0) > 0 && (
                            <span className={cx("rounded-full bg-danger px-1.5 text-[11px] leading-[18px] font-bold text-white tabular", collapsed ? "absolute top-1 right-1" : "max-lg:absolute max-lg:top-1 max-lg:right-1")}>
                              {status.data!.openAlerts}
                              <span className="sr-only"> open alerts</span>
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
          <div className={cx("m-3 rounded-[10px] bg-navy-2 px-3 py-2.5", collapsed && "mx-2 px-0 text-center")}>
            <div className={cx("flex items-center gap-2 text-[12.5px] font-semibold", collapsed && "justify-center")} role="status" aria-live="polite">
              <span
                className={cx(
                  "h-2 w-2 shrink-0 rounded-full",
                  brokerState === "connected" ? "bg-success" : brokerState === "reconnecting" ? "bg-warning animate-pulse" : "bg-danger",
                )}
                aria-hidden="true"
              />
              <span className={cx(collapsed ? "sr-only" : "max-lg:sr-only")}>
                {brokerState === "connected" ? "Broker connected" : brokerState === "reconnecting" ? "Reconnecting..." : "Broker disconnected"}
              </span>
            </div>
            <div className={cx("mt-0.5 pl-4 text-[11.5px] text-white/50", collapsed ? "hidden" : "max-lg:hidden")}>MQTT . {status.data?.nodesOnline ?? "-"} nodes online</div>
          </div>
          <button onClick={() => setCollapsed((c) => !c)} className="mx-3 mb-3 hidden h-8 items-center justify-center rounded-[8px] text-white/50 hover:bg-navy-2 hover:text-white lg:flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={16} />
          </button>
        </aside>

        <div className={cx("flex min-w-0 flex-1 flex-col", collapsed ? "pl-[68px]" : "pl-[220px] max-lg:pl-[68px]")}>
          <TopBar me={me} header={header} />
          {brokerState === "disconnected" && (
            <div className="no-print flex items-center gap-2 border-b border-danger/25 bg-danger-soft px-6 py-2 text-[13px] font-medium text-danger-dark" role="alert">
              <Icon name="wifiOff" size={16} />
              Live updates paused. Showing last known data. Reconnecting automatically...
            </div>
          )}
          <main id="main" className="flex-1 px-6 py-5 max-md:px-4">
            <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
          </main>
        </div>
      </div>
    </HeaderCtx.Provider>
  );
}

function TopBar({ me, header }: { me: Me; header: { title: ReactNode; subtitle?: ReactNode } }) {
  const router = useRouter();
  const { site, setSite } = useApp();
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const value = site.siteId == null ? "all" : site.lineId ? `${site.siteId}:${site.lineId}` : `${site.siteId}`;
  return (
    <header className="no-print sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-4 border-b border-line bg-white px-6 py-2 max-md:px-4">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[20px] leading-7 font-bold text-ink">{header.title}</h1>
        {header.subtitle && <div className="truncate text-[12.5px] text-muted">{header.subtitle}</div>}
      </div>
      <label className="relative max-md:hidden">
        <span className="sr-only">Site</span>
        <select
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "all") setSite({ siteId: null, lineId: null });
            else {
              const [s, l] = v.split(":").map(Number);
              setSite({ siteId: s, lineId: l || null });
            }
            qc.invalidateQueries();
          }}
          className="h-9 appearance-none rounded-[8px] border border-line-strong bg-white pr-8 pl-3 text-[13px] font-medium text-ink-2 outline-none focus:border-teal focus:ring-3 focus:ring-teal/20"
        >
          <option value="all">Site: All sites</option>
          {me.sites.map((s) => [
            <option key={s.id} value={String(s.id)}>
              Site: {s.name}
            </option>,
            ...s.lines.map((l) => (
              <option key={`${s.id}:${l.id}`} value={`${s.id}:${l.id}`}>
                Site: {s.name} . {l.name}
              </option>
            )),
          ])}
        </select>
        <Icon name="chevronDown" size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted" />
      </label>
      <form
        role="search"
        className="relative max-lg:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/machines${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
        }}
      >
        <label htmlFor="global-search" className="sr-only">
          Search machines
        </label>
        <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          id="global-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search machines"
          className="h-9 w-56 rounded-[8px] border border-line-strong bg-white pr-3 pl-9 text-[13px] outline-none placeholder:text-muted-2 focus:border-teal focus:ring-3 focus:ring-teal/20"
        />
      </form>
      <NotificationBell />
      <AccountMenu me={me} />
    </header>
  );
}
