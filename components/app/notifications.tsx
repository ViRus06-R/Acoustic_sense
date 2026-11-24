"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import { useApp } from "./context";
import { Icon } from "@/components/ui/icons";
import { cx, Spinner } from "@/components/ui/basic";
import { relativeTime } from "@/lib/shared/format";

interface Notif {
  id: number;
  alertId: number | null;
  severity: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

const SEV_STYLE: Record<string, string> = {
  Anomaly: "bg-danger-soft text-danger",
  Warning: "bg-warning-soft text-warning-ink",
  Offline: "bg-offline-soft text-offline-ink",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();
  const { bumpKey } = useApp();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ items: Notif[]; unread: number }>("/api/notifications?limit=10"), refetchInterval: 60_000 });
  const readAll = useMutation({ mutationFn: () => api("/api/notifications/read-all", { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  const readOne = useMutation({ mutationFn: (id: number) => api(`/api/notifications/${id}/read`, { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const unread = q.data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative grid h-9 w-9 place-items-center rounded-[8px] text-ink-2 hover:bg-page"
      >
        <Icon name="bell" size={19} />
        {unread > 0 && (
          <span key={bumpKey} className="bump absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10.5px] leading-[18px] font-bold text-white tabular">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-50 mt-2 w-[380px] max-w-[calc(100vw-2rem)] rounded-[12px] border border-line bg-white shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-bold">Notifications</span>
            <button className="text-[13px] font-semibold text-teal hover:underline disabled:opacity-40" disabled={!unread || readAll.isPending} onClick={() => readAll.mutate()}>
              Mark all as read
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {q.isPending ? (
              <div className="flex justify-center p-6 text-muted">
                <Spinner />
              </div>
            ) : q.error ? (
              <div className="p-6 text-center text-sm text-muted">Could not load notifications.</div>
            ) : !q.data!.items.length ? (
              <div className="p-8 text-center text-sm text-muted">You are all caught up.</div>
            ) : (
              <ul>
                {q.data!.items.map((n) => (
                  <li key={n.id}>
                    <button
                      className={cx("flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-page", !n.read && "bg-teal-soft/35")}
                      onClick={() => {
                        if (!n.read) readOne.mutate(n.id);
                        setOpen(false);
                        if (n.alertId) router.push(`/alerts?id=${n.alertId}`);
                      }}
                    >
                      <span className={cx("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full", SEV_STYLE[n.severity] ?? "bg-teal-soft text-teal")}>
                        <Icon name={n.severity === "Offline" ? "wifiOff" : "alert"} size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">{n.title}</span>
                        <span className="block truncate text-[12.5px] text-muted">{n.body}</span>
                        <span className="mt-0.5 block text-[11.5px] text-muted-2">{relativeTime(n.createdAt)}</span>
                      </span>
                      {!n.read && (
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-teal" aria-label="Unread">
                          <span className="sr-only">Unread</span>
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-line p-2">
            <button
              className="h-9 w-full rounded-[8px] text-[13px] font-semibold text-teal hover:bg-teal-soft"
              onClick={() => {
                setOpen(false);
                router.push("/alerts");
              }}
            >
              View all alerts
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
