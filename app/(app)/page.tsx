"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/client/api";
import { useApp } from "@/components/app/context";
import { usePageHeader } from "@/components/app/shell";
import { MachineCard } from "@/components/app/machine-card";
import { Card, KpiCard, StatusPill, TextLink } from "@/components/ui/basic";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/data";
import { ScoreChart } from "@/components/ui/charts";
import { fmtScore, relativeTime } from "@/lib/shared/format";
import type { MachineItem } from "@/lib/client/types";

interface Dash {
  kpi: { monitored: number; healthy: number; warning: number; anomaly: number; offline: number };
  machines: MachineItem[];
  recentAlerts: { id: number; severity: string; status: string; score: number | null; threshold: number | null; detectedAt: string; nodeId: string; machine: string | null; machineId: number | null }[];
  fleetSeries: { t: string; v: number }[];
  threshold: number;
}

export default function DashboardPage() {
  const { siteParams } = useApp();
  const q = useQuery({ queryKey: ["dashboard", siteParams], queryFn: () => api<Dash>(`/api/dashboard${qs(siteParams)}`), refetchInterval: 30_000 });
  usePageHeader("Fleet overview", q.dataUpdatedAt ? <LiveSubtitle at={q.dataUpdatedAt} /> : "Live machine health");

  if (q.error) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const d = q.data;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-5 gap-4 max-xl:grid-cols-3 max-md:grid-cols-2">
        {d ? (
          <>
            <KpiCard label="Monitored" value={d.kpi.monitored} />
            <KpiCard label="Healthy" value={d.kpi.healthy} tone="success" />
            <KpiCard label="Warning" value={d.kpi.warning} tone="warning" />
            <KpiCard label="Anomaly" value={d.kpi.anomaly} tone="danger" />
            <KpiCard label="Offline" value={d.kpi.offline} tone="offline" />
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-[12px]" />)
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] gap-5 max-xl:grid-cols-1">
        <Card title="Machine health" actions={<TextLink href="/machines">View all machines</TextLink>}>
          {!d ? (
            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[118px] rounded-[10px]" />
              ))}
            </div>
          ) : d.machines.length === 0 ? (
            <EmptyState title="No machines at this site" body="Add machines on the Machines page, or choose another site in the top bar." />
          ) : (
            <div className="grid grid-cols-3 gap-3 max-2xl:grid-cols-2 max-md:grid-cols-1">
              {d.machines.map((m) => (
                <MachineCard key={m.id} m={m} />
              ))}
            </div>
          )}
        </Card>

        <Card title="Recent alerts" actions={<TextLink href="/alerts">Alert centre</TextLink>}>
          {!d ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : d.recentAlerts.length === 0 ? (
            <EmptyState title="No alerts" body="Nothing has been detected recently." icon="check" />
          ) : (
            <ul className="divide-y divide-line">
              {d.recentAlerts.map((a) => (
                <li key={a.id}>
                  <Link href={`/alerts?id=${a.id}`} className="flex items-start gap-3 py-3 hover:bg-page/60">
                    <StatusPill status={a.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-ink">{a.machine ?? a.nodeId}</span>
                        <span className="shrink-0 text-[12px] text-muted">{relativeTime(a.detectedAt)}</span>
                      </div>
                      <div className="truncate text-[12.5px] text-muted tabular">
                        {a.severity === "Offline" ? `No heartbeat . Node ${a.nodeId}` : `Score ${fmtScore(a.score)} > thr ${fmtScore(a.threshold)}`}
                        {a.status !== "Open" && ` . ${a.status}`}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Fleet anomaly score . last 24 h" subtitle="Mean reconstruction error across all machines in scope">
        {!d ? <Skeleton className="h-[260px]" /> : d.fleetSeries.length ? <ScoreChart points={d.fleetSeries} threshold={d.threshold} range="24h" label="Fleet mean anomaly score" /> : <EmptyState title="No telemetry in the last 24 h" body="Start the simulator or connect a node to see live scores." />}
      </Card>
    </div>
  );
}

function LiveSubtitle({ at }: { at: number }) {
  const { rt } = useApp();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span>
      Live machine health . {rt === "connected" ? `updated ${relativeTime(new Date(at))}` : "live updates paused"}
    </span>
  );
}
