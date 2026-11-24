"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, qs } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/use-url-state";
import { can, useApp } from "@/components/app/context";
import { usePageHeader } from "@/components/app/shell";
import { Button, Card, cx, InfoBox, KeyValue, StatusPill } from "@/components/ui/basic";
import { EmptyState, ErrorState, Pagination, Skeleton, Table, TableSkeleton } from "@/components/ui/data";
import { Checkbox, FilterSelect, Input, Select, Textarea } from "@/components/ui/form";
import { ScoreChart } from "@/components/ui/charts";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { fmtDateTime, fmtDuration, fmtScore, relativeTime } from "@/lib/shared/format";
import type { AlertItem, MachineItem } from "@/lib/client/types";

const DEFAULTS = { status: "All", severity: "All", machine: "All", node: "", range: "7", page: "1", id: "" };
const MAINTENANCE_ACTIONS = [
  "Bearing lubricated",
  "Bearing replaced",
  "Fan blade rebalanced",
  "Belt replaced",
  "Coupling realigned",
  "Mounting bolts retightened",
  "Impeller cleaned",
  "Air filter replaced",
  "Sensor re-seated",
  "No fault found",
  "Other",
];

interface AlertDetail extends AlertItem {
  trace: { t: string; v: number }[];
  history: { at: string; userName: string; action: string; details: Record<string, unknown> | null }[];
}

export default function AlertCentrePage() {
  const { siteParams } = useApp();
  const [f, setF] = useUrlState(DEFAULTS);
  const list = useQuery({
    queryKey: ["alerts", "centre", siteParams, f.status, f.severity, f.machine, f.node, f.range, f.page],
    queryFn: () =>
      api<{ items: AlertItem[]; total: number; page: number; pageSize: number; summary: { open: number; acknowledged: number; resolvedMonth: number } }>(
        `/api/alerts${qs({ ...siteParams, status: f.status, severity: f.severity, machine: f.machine === "All" ? null : f.machine, node: f.node || null, range: f.range, page: f.page, pageSize: 12 })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const machines = useQuery({ queryKey: ["machines", "options", siteParams], queryFn: () => api<{ items: MachineItem[] }>(`/api/machines${qs({ ...siteParams, sort: "name", pageSize: 200 })}`) });
  const s = list.data?.summary;
  usePageHeader("Alert centre", s ? `${s.open} open . ${s.acknowledged} acknowledged . ${s.resolvedMonth} resolved this month` : "Loading alerts...");

  const selectedId = f.id ? Number(f.id) : (list.data?.items[0]?.id ?? null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ status: v })} options={["All", "Open", "Acknowledged", "Resolved"].map((x) => ({ value: x, label: x === "All" ? "Status: All" : x }))} />
        <FilterSelect label="Severity" value={f.severity} onChange={(v) => setF({ severity: v })} options={["All", "Anomaly", "Warning", "Offline"].map((x) => ({ value: x, label: x === "All" ? "Severity: All" : x }))} />
        <FilterSelect
          label="Machine"
          value={f.machine}
          onChange={(v) => setF({ machine: v })}
          options={[{ value: "All", label: "Machine: All" }, ...(machines.data?.items ?? []).map((m) => ({ value: String(m.id), label: m.name }))]}
        />
        <FilterSelect
          label="Time range"
          value={f.range}
          onChange={(v) => setF({ range: v })}
          options={[
            { value: "1", label: "Last 24 hours" },
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "all", label: "All time" },
          ]}
        />
        {f.node && (
          <button onClick={() => setF({ node: "" })} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-teal/40 bg-teal-soft px-3 text-[13px] font-semibold text-teal-dark">
            Node {f.node} <Icon name="x" size={14} />
            <span className="sr-only">Remove node filter</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(360px,1fr)] items-start gap-5 max-xl:grid-cols-1">
        <Card bodyClassName="p-0">
          {list.error ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : !list.data ? (
            <TableSkeleton rows={8} cols={5} />
          ) : list.data.items.length === 0 ? (
            <EmptyState title="No alerts match these filters" body="Try a longer time range or clear the filters." action={<Button variant="secondary" onClick={() => setF({ status: "All", severity: "All", machine: "All", node: "", range: "30" })}>Clear filters</Button>} />
          ) : (
            <>
              <Table
                rows={list.data.items}
                rowKey={(a) => a.id}
                selectedKey={selectedId}
                onRowClick={(a) => setF({ id: String(a.id) }, { resetPage: false })}
                rowLabel={(a) => `Alert ${a.code}, ${a.severity}, ${a.machine ?? a.nodeId}`}
                columns={[
                  { key: "sev", header: "Severity", render: (a) => <StatusPill status={a.severity} /> },
                  {
                    key: "m",
                    header: "Machine / node",
                    render: (a) => (
                      <div>
                        <div className="font-semibold whitespace-nowrap text-ink">{a.machine ?? "Unassigned"}</div>
                        <div className="text-xs whitespace-nowrap text-muted">
                          {a.nodeId} . #{a.code}
                        </div>
                      </div>
                    ),
                  },
                  { key: "score", header: "Score", align: "right", render: (a) => <span className={cx("font-bold tabular", a.severity === "Anomaly" ? "text-danger" : a.severity === "Warning" ? "text-warning-ink" : "text-muted")}>{fmtScore(a.score)}</span> },
                  {
                    key: "det",
                    header: "Detected",
                    render: (a) => (
                      <div>
                        <div className="whitespace-nowrap text-ink-2 tabular">{fmtDateTime(a.detectedAt)}</div>
                        <div className="text-xs text-muted">{relativeTime(a.detectedAt)}</div>
                      </div>
                    ),
                  },
                  { key: "st", header: "Status", render: (a) => <StatusPill status={a.status} /> },
                ]}
              />
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} shown={list.data.items.length} onPage={(p) => setF({ page: String(p) }, { resetPage: false })} />
            </>
          )}
        </Card>
        {selectedId ? <AlertPanel id={selectedId} /> : <Card><EmptyState title="Select an alert" body="Choose an alert on the left to see details and actions." icon="alert" /></Card>}
      </div>
    </div>
  );
}

function AlertPanel({ id }: { id: number }) {
  const { me } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["alert", id], queryFn: () => api<AlertDetail>(`/api/alerts/${id}`) });
  const a = q.data;
  const operate = can(me, "operate");
  const [assignOpen, setAssignOpen] = useState(false);
  const assignees = useQuery({ queryKey: ["assignees", id], queryFn: () => api<{ id: number; name: string; role: string }[]>(`/api/alerts/${id}/assignees`), enabled: assignOpen && operate });
  const [form, setForm] = useState({ actionTaken: "", notes: "", downtimeMin: "", partsUsed: "", recalibrate: false });
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the resolve form when another alert is selected
    setForm({ actionTaken: "", notes: "", downtimeMin: "", partsUsed: "", recalibrate: false });
    setFields({});
    setAssignOpen(false);
  }, [id]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["alerts"] });
    qc.invalidateQueries({ queryKey: ["alert", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["status"] });
  };
  const onErr = (title: string) => (e: unknown) => {
    if (e instanceof ApiError) setFields(e.fields);
    toast({ tone: "error", title, body: (e as Error).message });
  };
  const ack = useMutation({ mutationFn: () => api(`/api/alerts/${id}/acknowledge`, { method: "POST" }), onSuccess: () => { refresh(); toast({ tone: "success", title: `Alert #${a?.code} acknowledged` }); }, onError: onErr("Could not acknowledge") });
  const assign = useMutation({
    mutationFn: (userId: number) => api<{ assignee: { name: string } }>(`/api/alerts/${id}/assign`, { body: { userId } }),
    onSuccess: (r) => {
      refresh();
      setAssignOpen(false);
      toast({ tone: "success", title: `Assigned to ${r.assignee.name}`, body: "They have been notified." });
    },
    onError: onErr("Could not assign"),
  });
  const resolve = useMutation({
    mutationFn: () =>
      api(`/api/alerts/${id}/resolve`, {
        body: { actionTaken: form.actionTaken, notes: form.notes, downtimeMin: form.downtimeMin === "" ? null : Number(form.downtimeMin), partsUsed: form.partsUsed, recalibrate: form.recalibrate },
      }),
    onSuccess: () => {
      refresh();
      toast({ tone: "success", title: `Alert #${a?.code} resolved`, body: "Maintenance record saved." });
    },
    onError: onErr("Could not resolve"),
  });

  if (q.error) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  if (!a)
    return (
      <Card>
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-20" />
          <Skeleton className="h-36" />
        </div>
      </Card>
    );

  const pct = a.score != null && a.threshold ? Math.round(((a.score - a.threshold) / a.threshold) * 100) : null;
  return (
    <Card
      title={
        <span className="flex items-center gap-2.5">
          Alert #{a.code} <StatusPill status={a.status} />
        </span>
      }
      subtitle={
        <>
          {a.machineId ? <Link href={`/machines/${a.machineId}`} className="font-semibold text-teal hover:underline">{a.machine}</Link> : "Unassigned"} . <Link href={`/nodes/${a.nodeId}`} className="hover:underline">{a.nodeId}</Link> . {a.line ? `${a.site} . ${a.line}` : a.site}
        </>
      }
    >
      <div className="space-y-4">
        {a.severity === "Offline" ? (
          <InfoBox tone="danger" icon="wifiOff">
            <b>No heartbeat from node {a.nodeId}.</b> The node stopped reporting at {fmtDateTime(a.detectedAt)}. Buffered events will appear as &quot;Offline log sync&quot; when it reconnects.
          </InfoBox>
        ) : (
          <InfoBox tone={a.severity === "Anomaly" ? "danger" : "warning"} icon="alert">
            <b>Reconstruction error above threshold.</b> Score {fmtScore(a.score)} vs threshold {fmtScore(a.threshold)}
            {pct != null && ` (+${pct}%)`}. Sustained for {a.windows} consecutive window{a.windows === 1 ? "" : "s"}. First detected {fmtDateTime(a.detectedAt)} . {a.deliveredVia === "MQTT live" ? "live via MQTT" : "via offline log sync"}
          </InfoBox>
        )}
        {a.trace.length > 1 && <ScoreChart points={a.trace} threshold={a.threshold} range="1h" height={150} label={`Score around alert ${a.code}`} />}

        {a.status !== "Resolved" && operate && (
          <div className="flex flex-wrap items-center gap-2">
            {a.status === "Open" && (
              <Button onClick={() => ack.mutate()} loading={ack.isPending}>
                Acknowledge
              </Button>
            )}
            <div className="relative">
              <Button variant="secondary" onClick={() => setAssignOpen((o) => !o)} aria-expanded={assignOpen} aria-haspopup="listbox">
                {a.assignee ? `Assigned: ${a.assignee}` : "Assign to..."} <Icon name="chevronDown" size={15} />
              </Button>
              {assignOpen && (
                <div className="absolute z-40 mt-1.5 w-64 rounded-[10px] border border-line bg-white py-1.5 shadow-[var(--shadow-pop)]" role="listbox" aria-label="Assign to">
                  {!assignees.data ? (
                    <div className="px-3 py-2 text-sm text-muted">Loading...</div>
                  ) : assignees.data.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted">No engineers with access to this site.</div>
                  ) : (
                    assignees.data.map((u) => (
                      <button key={u.id} role="option" aria-selected={a.assigneeId === u.id} onClick={() => assign.mutate(u.id)} className="flex w-full items-center justify-between px-3.5 py-2 text-left text-sm hover:bg-page">
                        <span>{u.name}</span>
                        <span className="text-xs text-muted">{u.role === "admin" ? "Admin" : "Engineer"}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <KeyValue
          rows={[
            ["Severity", <StatusPill key="s" status={a.severity} />],
            ["Duration", fmtDuration(a.durationSec)],
            ["Delivered via", a.deliveredVia],
            ["Assignee", a.assignee ?? "-"],
            ...(a.acknowledgedAt ? ([["Acknowledged", `${a.acknowledgedBy ?? "System"} . ${fmtDateTime(a.acknowledgedAt)}`]] as [string, string][]) : []),
          ]}
        />

        {a.status === "Resolved" ? (
          <div className="rounded-[10px] border border-line bg-page/60 p-4">
            <h3 className="mb-2 text-sm font-bold text-ink">Maintenance record</h3>
            <KeyValue
              rows={[
                ["Resolved", `${a.resolvedBy ?? "System"} . ${fmtDateTime(a.resolvedAt)}`],
                ["Action taken", a.actionTaken ?? "-"],
                ["Downtime", a.downtimeMin != null ? `${a.downtimeMin} min` : "-"],
                ["Parts used", a.partsUsed || "-"],
                ["Recalibrate after fix", a.recalibrateAfterFix ? "Yes" : "No"],
              ]}
            />
            {a.notes && <p className="mt-3 text-sm whitespace-pre-wrap text-ink-2">{a.notes}</p>}
          </div>
        ) : operate ? (
          <form
            className="space-y-3 border-t border-line pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.actionTaken) {
                setFields({ actionTaken: "Action taken is required" });
                return;
              }
              resolve.mutate();
            }}
          >
            <h3 className="text-sm font-bold text-ink">Resolve with maintenance record</h3>
            <Select label="Action taken" value={form.actionTaken} onChange={(e) => setForm({ ...form, actionTaken: e.target.value })} error={fields.actionTaken} aria-required="true">
              <option value="">Select an action...</option>
              {MAINTENANCE_ACTIONS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} error={fields.notes} placeholder="What did you find? What did you do?" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Downtime (min)" type="number" min={0} inputMode="numeric" value={form.downtimeMin} onChange={(e) => setForm({ ...form, downtimeMin: e.target.value })} error={fields.downtimeMin} />
              <Input label="Parts used" value={form.partsUsed} onChange={(e) => setForm({ ...form, partsUsed: e.target.value })} error={fields.partsUsed} placeholder="e.g. Bearing 6205-2RS" />
            </div>
            <Checkbox label="Recalibrate threshold after fix" checked={form.recalibrate} onChange={(v) => setForm({ ...form, recalibrate: v })} />
            <Button type="submit" className="w-full" loading={resolve.isPending}>
              Mark as resolved
            </Button>
            <p className="text-center text-xs text-muted">Every action is logged with user and time.</p>
          </form>
        ) : (
          <p className="text-[13px] text-muted">You have read-only access. Maintenance Engineers and Admins can acknowledge and resolve alerts.</p>
        )}

        {a.history.length > 0 && (
          <div className="border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-bold text-ink">Activity</h3>
            <ul className="space-y-2">
              {a.history.map((h, i) => (
                <li key={i} className="flex gap-2 text-[13px]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" aria-hidden="true" />
                  <span>
                    <b className="text-ink">{h.userName}</b> <span className="text-ink-2">{h.action.replace("alert.", "")}</span>
                    {h.details && "assignee" in h.details ? ` to ${String(h.details.assignee)}` : ""} <span className="text-muted">. {fmtDateTime(h.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
