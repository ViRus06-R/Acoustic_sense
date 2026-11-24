"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, UNAUTHORIZED_EVENT } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";
import type { NotifyVia, Role } from "@/lib/shared/domain";

export interface Me {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  notifyVia: NotifyVia;
  lastLoginAt: string | null;
  sites: { id: number; name: string; timezone: string | null; lines: { id: number; name: string }[] }[];
}

export type Permission = "manage" | "operate" | "export";
/** UI mirror of the server rules. Server enforces; UI hides/disables. */
export function can(me: Me | undefined, p: Permission) {
  if (!me) return false;
  if (p === "manage") return me.role === "admin";
  if (p === "operate") return me.role === "admin" || me.role === "engineer";
  if (p === "export") return me.role === "admin" || me.role === "engineer";
  return false;
}

export type RealtimeStatus = "connected" | "reconnecting" | "disconnected";

interface AppCtx {
  me: Me;
  site: { siteId: number | null; lineId: number | null };
  setSite: (s: { siteId: number | null; lineId: number | null }) => void;
  siteParams: { site: number | null; line: number | null };
  siteLabel: string;
  rt: RealtimeStatus;
  bumpKey: number;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

export function useMeQuery() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/auth/me"), staleTime: 60_000, retry: false });
}

const SITE_KEY = "as.site";

export function AppProvider({ me, children }: { me: Me; children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [site, setSiteState] = useState<{ siteId: number | null; lineId: number | null }>({ siteId: null, lineId: null });
  const [rt, setRt] = useState<RealtimeStatus>("reconnecting");
  const [bumpKey, setBumpKey] = useState(0);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SITE_KEY) ?? "null");
      if (saved && (saved.siteId === null || me.sites.some((s) => s.id === saved.siteId))) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a persisted browser preference after mount
        setSiteState(saved);
      }
    } catch {}
  }, [me.sites]);

  const setSite = useCallback((s: { siteId: number | null; lineId: number | null }) => {
    setSiteState(s);
    localStorage.setItem(SITE_KEY, JSON.stringify(s));
  }, []);

  // Session expiry -> back to sign in, then return to this page.
  useEffect(() => {
    const onUnauth = () => {
      const next = window.location.pathname + window.location.search;
      qc.clear();
      router.replace(`/login?expired=1&next=${encodeURIComponent(next)}`);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauth);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauth);
  }, [qc, router]);

  // Real-time channel (SSE) with automatic reconnection + exponential backoff. Never throws into the UI.
  const pending = useRef(new Set<string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let es: EventSource | null = null;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let brokerOk = true;

    const invalidate = (...keys: string[]) => {
      keys.forEach((k) => pending.current.add(k));
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        const ks = [...pending.current];
        pending.current.clear();
        ks.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      }, 1500);
    };

    const connect = () => {
      if (closed) return;
      es = new EventSource("/api/stream");
      es.addEventListener("hello", (e) => {
        attempt = 0;
        const d = JSON.parse((e as MessageEvent).data);
        brokerOk = d.broker === "connected";
        setRt(brokerOk ? "connected" : d.broker === "reconnecting" ? "reconnecting" : "disconnected");
        invalidate("dashboard", "machines", "machine", "nodes", "node", "alerts", "alert", "notifications", "status");
      });
      es.addEventListener("ping", (e) => {
        const d = JSON.parse((e as MessageEvent).data);
        setRt(d.broker === "connected" ? "connected" : d.broker === "reconnecting" ? "reconnecting" : "disconnected");
      });
      es.addEventListener("broker", (e) => {
        const d = JSON.parse((e as MessageEvent).data);
        setRt(d.status);
        invalidate("status");
      });
      es.addEventListener("machine", () => invalidate("dashboard", "machines", "machine", "machine-series", "status"));
      es.addEventListener("node", () => invalidate("nodes", "node", "status", "dashboard"));
      es.addEventListener("alert", () => invalidate("alerts", "alert", "dashboard", "machine", "node", "status"));
      es.addEventListener("notification", (e) => {
        const d = JSON.parse((e as MessageEvent).data) as { title: string; body: string; alertId: number | null; severity: string };
        qc.invalidateQueries({ queryKey: ["notifications"] });
        setBumpKey((k) => k + 1);
        toast({
          tone: d.severity === "Anomaly" ? "error" : d.severity === "Warning" || d.severity === "Offline" ? "warning" : "info",
          title: d.title,
          body: d.body,
          action: d.alertId ? { label: "Open alert", onClick: () => router.push(`/alerts?id=${d.alertId}`) } : undefined,
        });
      });
      es.addEventListener("session-revoked", () => window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT)));
      es.onerror = () => {
        es?.close();
        es = null;
        if (closed) return;
        attempt++;
        setRt(attempt > 2 ? "disconnected" : "reconnecting");
        // The session may have expired: probe it, which triggers the redirect on 401.
        if (attempt === 2) api("/api/auth/me").catch(() => {});
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) + Math.random() * 500;
        retry = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      closed = true;
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, [qc, router, toast]);

  const value = useMemo<AppCtx>(() => {
    const s = me.sites.find((x) => x.id === site.siteId);
    const l = s?.lines.find((x) => x.id === site.lineId);
    return {
      me,
      site,
      setSite,
      siteParams: { site: site.siteId, line: site.lineId },
      siteLabel: s ? (l ? `${s.name} . ${l.name}` : s.name) : "All sites",
      rt,
      bumpKey,
    };
  }, [me, site, setSite, rt, bumpKey]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
