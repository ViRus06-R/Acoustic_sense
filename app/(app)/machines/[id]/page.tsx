"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/client/api";
import { can, useApp } from "@/components/app/context";
import { usePageHeader } from "@/components/app/shell";
import { MachineFormModal } from "@/components/app/machine-form";
import { Button, Card, cx, Flash, KeyValue, Pill, StatusPill } from "@/components/ui/basic";
import { EmptyState, ErrorState, Pagination, Skeleton, Table, TableSkeleton, Tabs } from "@/components/ui/data";
import { ScoreChart } from "@/components/ui/charts";
import { ConfirmDialog, Menu } from "@/components/ui/overlay";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { fmtDateTime, fmtDuration, fmtScore, relativeTime } from "@/lib/shared/format";
import type { AlertItem, MachineItem } from "@/lib/client/types";
import { NotFoundView } from "@/components/app/system-pages";

interface MachineDetail extends MachineItem {
  siteId: number;
  lineId: number | null;
  nodeDetail: {
    id: string;
    mountingNote: string;
    firmware: string | null;
    model: string | null;
    threshold: number;
    thresholdCalibrated: boolean;
    inferenceMs: number | null;
    rssi: number | null;
    pending: number;
    lastHeartbeatAt: string | null;
    recalibrationRequestedAt: string | null;
    status: string;
  } | null;
}

type Range = "1h" | "24h" | "7d" | "30d";

export default function MachineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [range, setRange] = useState<Range>("24h");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const m = useQuery({ queryKey: ["machine", id], queryFn: () => api<MachineDetail>(`/api/machines/${id}`) });
  const series = useQuery({ queryKey: ["machine-series", id, range], queryFn: () => api<{ threshold: number | null; points: { t: string; v: number }[] }>(`/api/machines/${id}/series?range=${range}`), enabled: !!m.data });
  const events = useQuery({
    queryKey: ["alerts", "machine", id, page],
    queryFn: () => api<{ items: AlertItem[]; total: number; page: number; pageSize: number }>(`/api/alerts?machine=${id}&range=all&page=${page}&pageSize=8`),
    enabled: !!m.data,
  });

  const d = m.data;
  usePageHeader(
    d ? (
      <span className="flex items-center gap-3">
        {d.name} <StatusPill status={d.status} />
      </span>
    ) : (
      "Machine"
    ),
    d ? `${d.line ? `${d.line.name} . ` : `${d.site.name} . `}${d.nodeDetail ? `Node ${d.nodeDetail.id}` : "No node assigned"}${d.nodeDetail?.mountingNote ? ` . mounted on ${d.nodeDetail.mountingNote}` : ""}` : undefined,
  );

  const firstOpen = events.data?.items.find((e) => e.status === "Open");
  const target = events.data?.items.find((e) => e.id === selected && e.status === "Open") ?? firstOpen;
  const ack = useMutation({
    mutationFn: (alertId: number) => api(`/api/alerts/${alertId}/acknowledge`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ tone: "success", title: "Alert acknowledged", body: target?.code ? `#${target.code}` : undefined });
    },
    onError: (e) => toast({ tone: "error", title: "Could not acknowledge", body: (e as Error).message }),
  });
  const archive = useMutation({
    mutationFn: () => api(`/api/machines/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast({ tone: "success", title: "Machine archived", body: "History is kept; it no longer appears in lists." });
      router.push("/machines");
    },
    onError: (e) => toast({ tone: "error", title: "Could not archive", body: (e as Error).message }),
  });

  if (m.error) return m.error instanceof ApiError && m.error.status === 404 ? <NotFoundView what="machine" /> : <Card><ErrorState error={m.error} onRetry={() => m.refetch()} /></Card>;

  const n = d?.nodeDetail;
  return (
    <div className="space-y-5">
      {can(me, "manage") && d && (
        <div className="-mt-1 flex justify-end">
          <Menu
            label="Machine actions"
            trigger={
              <span className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-line-strong bg-white px-3 text-[13px] font-semibold text-ink-2 hover:bg-page">
                Actions <Icon name="chevronDown" size={15} />
              </span>
            }
            items={[
              { label: "Edit machine", onClick: () => setEditing(true) },
              "sep",
              { label: "Archive machine", danger: true, onClick: () => setArchiving(true) },
            ]}
          />
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] gap-5 max-xl:grid-cols-1">
        <Card title="Anomaly score (reconstruction MSE)" actions={<Tabs label="Chart range" value={range} onChange={setRange} options={["1h", "24h", "7d", "30d"].map((r) => ({ value: r as Range, label: r.replace("h", " h").replace("d", " d") }))} />}>
          {!series.data ? (
            <Skeleton className="h-[300px]" />
          ) : series.data.points.length ? (
            <ScoreChart points={series.data.points} threshold={series.data.threshold} range={range} height={300} />
          ) : (
            <EmptyState title="No score data in this range" body={n ? "The node has not reported in this period." : "Assign a node to this machine to start monitoring."} />
          )}
        </Card>

        <Card
          title={n ? `Edge node ${n.id}` : "Edge node"}
          actions={n ? <Link href={`/nodes/${n.id}`} className="text-[13px] font-semibold text-teal hover:underline">Node page</Link> : undefined}
        >
          {!d ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-5" />
              ))}
            </div>
          ) : !n ? (
            <EmptyState title="No node assigned" body={can(me, "manage") ? "Edit the machine to assign an unassigned node." : "An administrator can assign a node."} icon="node" />
          ) : (
            <KeyValue
              rows={[
                ["Status", <StatusPill key="s" status={n.status} />],
                ["Last heartbeat", <Flash key="h" value={n.lastHeartbeatAt}>{relativeTime(n.lastHeartbeatAt)}</Flash>],
                ["Firmware", n.firmware ?? "-"],
                ["Model", n.model ?? "-"],
                [
                  "Threshold",
                  <span key="t">
                    {fmtScore(n.threshold)} <span className="font-normal text-muted">({n.thresholdCalibrated ? "calibrated" : "manual"})</span>
                  </span>,
                ],
                ["Inference time", n.inferenceMs != null ? `${Math.round(n.inferenceMs)} ms / window` : "-"],
                ["Wi-Fi RSSI", n.rssi != null ? `${n.rssi} dBm` : "-"],
                ["Offline log", `${n.pending} event${n.pending === 1 ? "" : "s"} pending`],
                ...(n.recalibrationRequestedAt ? ([["Recalibration", <Pill key="r" tone="info">Requested {relativeTime(n.recalibrationRequestedAt)}</Pill>]] as [string, React.ReactNode][]) : []),
              ]}
            />
          )}
        </Card>
      </div>

      <Card
        title="Detection events"
        bodyClassName="p-0"
        actions={
          <>
            {can(me, "export") && (
              <a href={`/api/alerts/export.csv?machine=${id}`} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line-strong bg-white px-3 text-[13px] font-semibold text-ink-2 hover:bg-page">
                <Icon name="download" size={15} /> Export CSV
              </a>
            )}
            {can(me, "operate") && (
              <Button size="sm" disabled={!target} loading={ack.isPending} onClick={() => target && ack.mutate(target.id)} title={target ? `Acknowledge #${target.code}` : "No open events"}>
                Acknowledge{target ? ` #${target.code}` : ""}
              </Button>
            )}
          </>
        }
      >
        {events.error ? (
          <ErrorState error={events.error} onRetry={() => events.refetch()} />
        ) : !events.data ? (
          <TableSkeleton rows={5} cols={7} />
        ) : events.data.items.length === 0 ? (
          <EmptyState title="No detection events" body="This machine has not raised any alerts yet." icon="check" />
        ) : (
          <>
            <Table
              rows={events.data.items}
              rowKey={(e) => e.id}
              selectedKey={target?.id}
              onRowClick={(e) => (e.status === "Open" ? setSelected(e.id) : router.push(`/alerts?id=${e.id}`))}
              rowLabel={(e) => `Alert ${e.code}`}
              columns={[
                { key: "at", header: "Detected at", render: (e) => <span className="text-ink-2 tabular">{fmtDateTime(e.detectedAt)}</span> },
                { key: "sev", header: "Severity", render: (e) => <StatusPill status={e.severity} /> },
                { key: "score", header: "Score", align: "right", render: (e) => <span className={cx("font-bold tabular", e.severity === "Anomaly" ? "text-danger" : e.severity === "Warning" ? "text-warning-ink" : "text-muted")}>{fmtScore(e.score)}</span> },
                { key: "thr", header: "Threshold", align: "right", render: (e) => <span className="tabular">{fmtScore(e.threshold)}</span> },
                { key: "dur", header: "Duration", render: (e) => <span className="tabular">{fmtDuration(e.durationSec)}</span> },
                { key: "via", header: "Delivered via", render: (e) => <span className={e.deliveredVia === "Offline log sync" ? "font-medium text-warning-ink" : "text-ink-2"}>{e.deliveredVia}</span> },
                { key: "status", header: "Status", render: (e) => <StatusPill status={e.status} /> },
              ]}
            />
            <Pagination page={events.data.page} pageSize={events.data.pageSize} total={events.data.total} shown={events.data.items.length} onPage={setPage} />
          </>
        )}
      </Card>

      {d && (
        <MachineFormModal
          open={editing}
          onClose={() => setEditing(false)}
          initial={{ id: d.id, name: d.name, type: d.type, siteId: d.siteId, lineId: d.lineId, nodeId: d.node?.id ?? null, notes: d.notes }}
        />
      )}
      <ConfirmDialog open={archiving} onClose={() => setArchiving(false)} onConfirm={() => archive.mutate()} loading={archive.isPending} destructive title={`Archive ${d?.name ?? "machine"}?`} confirmLabel="Archive machine">
        <p>The machine disappears from lists and dashboards. Its alerts and history are kept for reports and audits. Its node is released so it can be assigned elsewhere.</p>
      </ConfirmDialog>
    </div>
  );
}
