"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/client/api";
import { can, useApp } from "@/components/app/context";
import { usePageHeader } from "@/components/app/shell";
import { CopyField, CredentialsDialog, RssiBars, type Credentials } from "@/components/app/node-bits";
import { NotFoundView } from "@/components/app/system-pages";
import { Button, Card, Flash, KeyValue, Pill, StatusPill } from "@/components/ui/basic";
import { EmptyState, ErrorState, Skeleton, Table, Tabs } from "@/components/ui/data";
import { SimpleLineChart, UptimeTimeline } from "@/components/ui/charts";
import { Input, Select } from "@/components/ui/form";
import { ConfirmDialog, Menu, Modal } from "@/components/ui/overlay";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { fmtDate, fmtDateTime, fmtDuration, fmtScore, relativeTime } from "@/lib/shared/format";
import type { AlertItem, MachineItem, NodeItem } from "@/lib/client/types";

interface NodeDetail extends NodeItem {
  registeredAt: string;
  recalibrationRequestedAt: string | null;
  thresholdCalibrated: boolean;
  config: { threshold: number; persistence: number; persistenceIsDefault: boolean; heartbeatInterval: number };
  topics: { alert: string; telemetry: string };
  recentEvents: AlertItem[];
}
type Range = "1h" | "24h" | "7d";

export default function NodeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [range, setRange] = useState<Range>("24h");
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [confirm, setConfirm] = useState<"rotate" | "decommission" | null>(null);
  const [reassign, setReassign] = useState(false);

  const q = useQuery({ queryKey: ["node", id], queryFn: () => api<NodeDetail>(`/api/nodes/${id}`) });
  const rssi = useQuery({ queryKey: ["node", id, "rssi", range], queryFn: () => api<{ points: { t: string; v: number }[] }>(`/api/nodes/${id}/rssi?range=${range}`), enabled: !!q.data });
  const hb = useQuery({ queryKey: ["node", id, "hb", range], queryFn: () => api<{ points: { t: string; online: boolean }[]; uptime: number }>(`/api/nodes/${id}/heartbeats?range=${range}`), enabled: !!q.data });
  const sync = useQuery({ queryKey: ["node", id, "sync"], queryFn: () => api<{ id: number; receivedAt: string; eventsSynced: number; outageStart: string; outageSec: number }[]>(`/api/nodes/${id}/sync-history`), enabled: !!q.data });
  const n = q.data;

  usePageHeader(
    n ? (
      <span className="flex items-center gap-3">
        <span className="font-mono">{n.id}</span> <StatusPill status={n.status} />
      </span>
    ) : (
      id
    ),
    n ? (
      <span>
        Mounted on {n.mountingNote || "(no mounting note)"} .{" "}
        {n.machine ? (
          <Link href={`/machines/${n.machine.id}`} className="font-semibold text-teal hover:underline">
            {n.machine.name}
          </Link>
        ) : (
          "no machine assigned"
        )}
      </span>
    ) : undefined,
  );

  const recal = useMutation({
    mutationFn: () => api(`/api/nodes/${id}/recalibrate`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["node", id] });
      toast({ tone: "success", title: "Recalibration requested", body: "Flag recorded on the node." });
    },
    onError: (e) => toast({ tone: "error", title: "Could not request recalibration", body: (e as Error).message }),
  });
  const rotate = useMutation({
    mutationFn: () => api<Credentials>(`/api/nodes/${id}/rotate-credentials`, { method: "POST" }),
    onSuccess: (r) => {
      setConfirm(null);
      setCreds(r);
    },
    onError: (e) => toast({ tone: "error", title: "Could not rotate credentials", body: (e as Error).message }),
  });
  const decommission = useMutation({
    mutationFn: () => api(`/api/nodes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast({ tone: "success", title: `Node ${id} decommissioned`, body: "History is kept." });
      router.push("/nodes");
    },
    onError: (e) => toast({ tone: "error", title: "Could not decommission", body: (e as Error).message }),
  });

  if (q.error) return q.error instanceof ApiError && q.error.status === 404 ? <NotFoundView what="node" /> : <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;

  return (
    <div className="space-y-5">
      {n && can(me, "manage") && (
        <div className="-mt-1 flex justify-end">
          <Menu
            label="Node actions"
            trigger={
              <span className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-line-strong bg-white px-3 text-[13px] font-semibold text-ink-2 hover:bg-page">
                Actions <Icon name="chevronDown" size={15} />
              </span>
            }
            items={[
              { label: "Reassign to machine", onClick: () => setReassign(true) },
              { label: "Rotate credentials", onClick: () => setConfirm("rotate") },
              "sep",
              { label: "Decommission node", danger: true, onClick: () => setConfirm("decommission") },
            ]}
          />
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-5 max-xl:grid-cols-1">
        <div className="space-y-5">
          <Card title="Wi-Fi RSSI" actions={<Tabs label="Range" value={range} onChange={setRange} options={(["1h", "24h", "7d"] as Range[]).map((r) => ({ value: r, label: r.replace("h", " h").replace("d", " d") }))} />}>
            {!rssi.data ? (
              <Skeleton className="h-[220px]" />
            ) : rssi.data.points.length ? (
              <SimpleLineChart
                label="Wi-Fi RSSI over time"
                data={rssi.data.points.map((p) => ({ ...p, label: new Date(p.t).toLocaleString("en-GB", range === "7d" ? { day: "2-digit", month: "short" } : { hour: "2-digit", minute: "2-digit", hour12: false }) }))}
                xKey="label"
                yKey="v"
                yFormat={(v) => `${v} dBm`}
                height={220}
              />
            ) : (
              <EmptyState title="No signal data in this range" />
            )}
          </Card>
          <Card title="Heartbeat / uptime" subtitle={hb.data ? `${hb.data.uptime}% of intervals with a heartbeat` : undefined}>
            {!hb.data ? <Skeleton className="h-12" /> : <UptimeTimeline points={hb.data.points} range={range} />}
          </Card>
        </div>

        <Card title="Edge node">
          {!n ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-5" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <KeyValue
                rows={[
                  ["Status", <StatusPill key="s" status={n.status} />],
                  ["Last heartbeat", <Flash key="h" value={n.lastHeartbeatAt}>{relativeTime(n.lastHeartbeatAt)}</Flash>],
                  ["Firmware", <span key="f">{n.firmware ?? "-"} {n.firmwareOutdated && <Pill tone="warning" dot={false}>Outdated</Pill>}</span>],
                  ["Model", n.model ?? "-"],
                  ["Threshold", <span key="t">{fmtScore(n.threshold)} <span className="font-normal text-muted">({n.thresholdCalibrated ? "calibrated" : "manual"})</span></span>],
                  ["Inference time", n.inferenceMs != null ? `${Math.round(n.inferenceMs)} ms / window` : "-"],
                  ["Wi-Fi RSSI", <RssiBars key="r" rssi={n.rssi} />],
                  ["Offline log pending", `${n.pending} event${n.pending === 1 ? "" : "s"}`],
                  ["Registered on", fmtDate(n.registeredAt)],
                ]}
              />
              <CopyField label="MQTT topic (alerts)" value={n.topics.alert} />
              <CopyField label="MQTT topic (telemetry)" value={n.topics.telemetry} />
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 max-xl:grid-cols-1">
        {n && <ConfigCard node={n} />}
        <Card title="Offline log sync history" bodyClassName="p-0">
          {!sync.data ? (
            <div className="p-5">
              <Skeleton className="h-24" />
            </div>
          ) : sync.data.length === 0 ? (
            <EmptyState title="No offline periods" body="When this node loses connection it buffers events and syncs them later. Those syncs appear here." icon="check" />
          ) : (
            <Table
              rows={sync.data}
              rowKey={(s) => s.id}
              dense
              columns={[
                { key: "t", header: "Synced at", render: (s) => <span className="tabular">{fmtDateTime(s.receivedAt)}</span> },
                { key: "n", header: "Events synced", align: "right", render: (s) => <span className="font-semibold tabular">{s.eventsSynced}</span> },
                { key: "o", header: "Outage duration", render: (s) => <span className="tabular">{fmtDuration(s.outageSec)}</span> },
              ]}
            />
          )}
        </Card>
      </div>

      <Card title="Recent detection events" bodyClassName="p-0" actions={<Link href={`/alerts?node=${id}&range=all`} className="text-[13px] font-semibold text-teal hover:underline">Open in Alert centre</Link>}>
        {!n ? (
          <div className="p-5">
            <Skeleton className="h-24" />
          </div>
        ) : n.recentEvents.length === 0 ? (
          <EmptyState title="No detection events" icon="check" />
        ) : (
          <Table
            rows={n.recentEvents}
            rowKey={(e) => e.id}
            onRowClick={(e) => router.push(`/alerts?id=${e.id}`)}
            rowLabel={(e) => `Alert ${e.code}`}
            columns={[
              { key: "at", header: "Detected at", render: (e) => <span className="tabular">{fmtDateTime(e.detectedAt)}</span> },
              { key: "sev", header: "Severity", render: (e) => <StatusPill status={e.severity} /> },
              { key: "score", header: "Score", align: "right", render: (e) => <span className="font-semibold tabular">{fmtScore(e.score)}</span> },
              { key: "via", header: "Delivered via", render: (e) => <span className={e.deliveredVia === "Offline log sync" ? "font-medium text-warning-ink" : ""}>{e.deliveredVia}</span> },
              { key: "st", header: "Status", render: (e) => <StatusPill status={e.status} /> },
            ]}
          />
        )}
      </Card>

      {n && can(me, "operate") && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {n.recalibrationRequestedAt && <Pill tone="info">Recalibration requested {relativeTime(n.recalibrationRequestedAt)}</Pill>}
          <Button variant="secondary" icon="refresh" onClick={() => recal.mutate()} loading={recal.isPending}>
            Request recalibration
          </Button>
        </div>
      )}

      <CredentialsDialog data={creds} onClose={() => setCreds(null)} title={`New credentials for ${id}`} />
      <ConfirmDialog open={confirm === "rotate"} onClose={() => setConfirm(null)} onConfirm={() => rotate.mutate()} loading={rotate.isPending} title="Rotate MQTT credentials?" confirmLabel="Rotate credentials">
        <p>A new password is generated and the old one stops working after the broker users are synced. The device must be updated with the new password.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === "decommission"} onClose={() => setConfirm(null)} onConfirm={() => decommission.mutate()} loading={decommission.isPending} destructive title={`Decommission ${id}?`} confirmLabel="Decommission node">
        <p>The node is removed from lists, its credentials are revoked and its machine is released. All telemetry and alert history is kept.</p>
      </ConfirmDialog>
      {n && <ReassignModal open={reassign} onClose={() => setReassign(false)} node={n} />}
    </div>
  );
}

function ConfigCard({ node }: { node: NodeDetail }) {
  const { me } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const editable = can(me, "operate");
  const [v, setV] = useState({ threshold: String(node.config.threshold), persistence: node.config.persistenceIsDefault ? "" : String(node.config.persistence), heartbeatInterval: String(node.config.heartbeatInterval) });
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync the form when the node changes on the server
    setV({ threshold: String(node.config.threshold), persistence: node.config.persistenceIsDefault ? "" : String(node.config.persistence), heartbeatInterval: String(node.config.heartbeatInterval) });
  }, [node.config.threshold, node.config.persistence, node.config.persistenceIsDefault, node.config.heartbeatInterval]);
  const save = useMutation({
    mutationFn: () =>
      api(`/api/nodes/${node.id}`, {
        method: "PATCH",
        body: { threshold: Number(v.threshold), persistence: v.persistence === "" ? null : Number(v.persistence), heartbeatInterval: Number(v.heartbeatInterval) },
      }),
    onSuccess: () => {
      setFields({});
      qc.invalidateQueries({ queryKey: ["node", node.id] });
      qc.invalidateQueries({ queryKey: ["machines"] });
      toast({ tone: "success", title: "Configuration saved", body: "Written to the node record and the audit log." });
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast({ tone: "error", title: "Could not save configuration", body: (e as Error).message });
    },
  });
  return (
    <Card title="Configuration" subtitle={editable ? "Per-node values override the Settings defaults." : "Read-only for your role."}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <Input label="Anomaly threshold" type="number" step="0.001" min="0" value={v.threshold} onChange={(e) => setV({ ...v, threshold: e.target.value })} disabled={!editable} error={fields.threshold} className="tabular" />
          <Input
            label="Persistence (windows)"
            type="number"
            min="1"
            placeholder={`${node.config.persistence} (default)`}
            value={v.persistence}
            onChange={(e) => setV({ ...v, persistence: e.target.value })}
            disabled={!editable}
            error={fields.persistence}
            hint="Empty = use default"
          />
          <Input label="Heartbeat interval (s)" type="number" min="1" value={v.heartbeatInterval} onChange={(e) => setV({ ...v, heartbeatInterval: e.target.value })} disabled={!editable} error={fields.heartbeatInterval} />
        </div>
        {editable && (
          <div className="flex justify-end">
            <Button type="submit" loading={save.isPending}>
              Save configuration
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

function ReassignModal({ open, onClose, node }: { open: boolean; onClose: () => void; node: NodeDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const machines = useQuery({ queryKey: ["machines", "reassign", node.site.id], queryFn: () => api<{ items: MachineItem[] }>(`/api/machines?site=${node.site.id}&pageSize=200&sort=name`), enabled: open });
  const [mid, setMid] = useState<string>(node.machine ? String(node.machine.id) : "");
  const save = useMutation({
    mutationFn: () => api(`/api/nodes/${node.id}/reassign`, { body: { machineId: mid ? Number(mid) : null } }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast({ tone: "success", title: "Node reassigned" });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: "Could not reassign", body: (e as Error).message }),
  });
  const options = (machines.data?.items ?? []).filter((m) => !m.node || m.node.id === node.id);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Reassign ${node.id}`}
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <Select label="Machine" value={mid} onChange={(e) => setMid(e.target.value)} hint={`Machines at ${node.site.name} without a node`}>
        <option value="">Unassigned</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Select>
    </Modal>
  );
}
