"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, qs } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/use-url-state";
import { can, useApp } from "@/components/app/context";
import { usePageHeader } from "@/components/app/shell";
import { CredentialsDialog, RssiBars, type Credentials } from "@/components/app/node-bits";
import { Button, Card, cx, Flash, KpiCard, Pill, StatusPill } from "@/components/ui/basic";
import { EmptyState, ErrorState, Skeleton, Table, TableSkeleton } from "@/components/ui/data";
import { FilterSelect, Input, SearchInput, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/shared/format";
import type { MachineItem, NodeItem, SiteItem } from "@/lib/client/types";

const DEFAULTS = { status: "All", firmware: "All", q: "" };

export default function NodesPage() {
  const { me, siteParams } = useApp();
  const router = useRouter();
  const [f, setF] = useUrlState(DEFAULTS);
  const [registering, setRegistering] = useState(false);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const q = useQuery({
    queryKey: ["nodes", siteParams, f.status, f.firmware, f.q],
    queryFn: () =>
      api<{ items: NodeItem[]; kpi: { total: number; online: number; offline: number; pending: number; outdated: number }; latestFirmware: string | null; firmwares: string[]; nextId: string }>(
        `/api/nodes${qs({ ...siteParams, status: f.status, firmware: f.firmware, q: f.q })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const d = q.data;
  usePageHeader("Nodes", d ? `${d.kpi.total} nodes . ${d.kpi.online} online` : "Loading nodes...");
  const filtered = f.status !== "All" || f.firmware !== "All" || !!f.q;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-4 max-xl:grid-cols-3 max-md:grid-cols-2">
        {d ? (
          <>
            <KpiCard label="Total nodes" value={d.kpi.total} />
            <KpiCard label="Online" value={d.kpi.online} tone="success" active={f.status === "Online"} />
            <KpiCard label="Offline" value={d.kpi.offline} tone="offline" onClick={() => setF({ status: f.status === "Offline" ? "All" : "Offline" })} active={f.status === "Offline"} />
            <KpiCard label="Offline logs pending" value={d.kpi.pending} tone={d.kpi.pending ? "warning" : undefined} hint="events buffered on nodes" />
            <KpiCard label="Firmware outdated" value={d.kpi.outdated} tone={d.kpi.outdated ? "warning" : undefined} hint={d.latestFirmware ? `latest ${d.latestFirmware}` : undefined} />
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-[12px]" />)
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput label="Search nodes" placeholder="Search node ID or machine" value={f.q} onChange={(v) => setF({ q: v })} className="w-64" />
        <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ status: v })} options={["All", "Online", "Degraded", "Offline"].map((x) => ({ value: x, label: x === "All" ? "Status: All" : x }))} />
        <FilterSelect label="Firmware" value={f.firmware} onChange={(v) => setF({ firmware: v })} options={[{ value: "All", label: "Firmware: All" }, ...(d?.firmwares ?? []).map((x) => ({ value: x, label: x }))]} />
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setF({ status: "All", firmware: "All", q: "" })}>
            Clear filters
          </Button>
        )}
        {can(me, "manage") && (
          <Button icon="plus" className="ml-auto" onClick={() => setRegistering(true)}>
            Register node
          </Button>
        )}
      </div>

      <Card bodyClassName="p-0">
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !d ? (
          <TableSkeleton rows={10} cols={8} />
        ) : d.items.length === 0 ? (
          <EmptyState title={filtered ? "No nodes match your filters" : "No nodes registered"} body={filtered ? "Try another status or firmware version." : "Register an ESP32-S3 node to start receiving data."} action={filtered ? <Button variant="secondary" onClick={() => setF({ status: "All", firmware: "All", q: "" })}>Clear filters</Button> : undefined} icon="node" />
        ) : (
          <Table
            rows={d.items}
            rowKey={(n) => n.id}
            rowLabel={(n) => `Open node ${n.id}`}
            onRowClick={(n) => router.push(`/nodes/${n.id}`)}
            columns={[
              { key: "id", header: "Node ID", render: (n) => <span className="font-mono text-[13px] font-bold whitespace-nowrap text-ink">{n.id}</span> },
              {
                key: "m",
                header: "Machine",
                render: (n) =>
                  n.machine ? (
                    <Link href={`/machines/${n.machine.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-teal hover:underline">
                      {n.machine.name}
                    </Link>
                  ) : (
                    <span className="text-muted">Unassigned</span>
                  ),
              },
              { key: "site", header: "Site / Line", render: (n) => <span className="whitespace-nowrap text-ink-2">{n.line ? `${n.site.name} . ${n.line.name}` : n.site.name}</span> },
              { key: "st", header: "Status", render: (n) => <StatusPill status={n.status} /> },
              { key: "hb", header: "Last heartbeat", render: (n) => <Flash value={n.lastHeartbeatAt} className={n.status === "Offline" ? "text-offline-ink" : "text-ink-2"}>{relativeTime(n.lastHeartbeatAt)}</Flash> },
              {
                key: "fw",
                header: "Firmware",
                render: (n) => (
                  <span className="flex items-center gap-1.5">
                    <span className="tabular">{n.firmware ?? "-"}</span>
                    {n.firmwareOutdated && <Pill tone="warning" dot={false} className="h-5 px-1.5 text-[10.5px]">Outdated</Pill>}
                  </span>
                ),
              },
              { key: "model", header: "Model", render: (n) => <span className="text-xs whitespace-nowrap text-ink-2" title={n.model ?? undefined}>{n.model?.split(" . ")[0] ?? "-"}</span> },
              { key: "rssi", header: "Wi-Fi signal", render: (n) => <RssiBars rssi={n.rssi} /> },
              { key: "inf", header: "Inference", align: "right", render: (n) => <span className="tabular">{n.inferenceMs != null ? `${Math.round(n.inferenceMs)} ms` : "-"}</span> },
              { key: "pend", header: "Pending", align: "right", render: (n) => <span className={cx("tabular", n.pending ? "font-bold text-warning-ink" : "text-muted")}>{n.pending}</span> },
            ]}
          />
        )}
      </Card>

      <RegisterNodeModal
        open={registering}
        nextId={d?.nextId ?? "AS-N-025"}
        onClose={() => setRegistering(false)}
        onCreated={(c) => {
          setRegistering(false);
          setCreds(c);
        }}
      />
      <CredentialsDialog data={creds} onClose={() => setCreds(null)} title={`Node ${creds?.credentials.username ?? ""} registered`} />
    </div>
  );
}

function RegisterNodeModal({ open, onClose, nextId, onCreated }: { open: boolean; onClose: () => void; nextId: string; onCreated: (c: Credentials) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => api<SiteItem[]>("/api/sites"), enabled: open });
  const machines = useQuery({ queryKey: ["machines", "all-for-node"], queryFn: () => api<{ items: MachineItem[] }>("/api/machines?pageSize=200&sort=name"), enabled: open });
  const [v, setV] = useState({ id: nextId, siteId: 0, lineId: "", machineId: "", mountingNote: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the dialog when it opens
      setV({ id: nextId, siteId: sites.data?.[0]?.id ?? 0, lineId: "", machineId: "", mountingNote: "" });
      setFields({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nextId]);
  const siteId = v.siteId || sites.data?.[0]?.id || 0; // first site until one is picked
  const site = sites.data?.find((s) => s.id === siteId);
  const free = (machines.data?.items ?? []).filter((m) => m.site.id === siteId && !m.node);
  const create = useMutation({
    mutationFn: () =>
      api<Credentials>("/api/nodes", {
        body: { id: v.id.trim().toUpperCase(), siteId, lineId: v.lineId ? Number(v.lineId) : null, machineId: v.machineId ? Number(v.machineId) : null, mountingNote: v.mountingNote },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      toast({ tone: "success", title: `Node ${r.credentials.username} registered` });
      onCreated(r);
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast({ tone: "error", title: "Could not register node", body: (e as Error).message });
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register node"
      description="An ESP32-S3 edge device. MQTT credentials are generated on save."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!/^AS-N-\d{3}$/i.test(v.id.trim()) || !siteId}>
            Register node
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Input label="Node ID" required value={v.id} onChange={(e) => setV({ ...v, id: e.target.value })} error={fields.id} hint="Pattern AS-N-### (next free ID suggested)" className="font-mono" />
        <Select label="Site" value={siteId || ""} onChange={(e) => setV({ ...v, siteId: Number(e.target.value), lineId: "", machineId: "" })} error={fields.siteId}>
          {(sites.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select label="Line" value={v.lineId} onChange={(e) => setV({ ...v, lineId: e.target.value })} error={fields.lineId} disabled={!site?.lines.length}>
          <option value="">{site?.lines.length ? "No line" : "This site has no lines"}</option>
          {(site?.lines ?? []).filter((l) => !l.archived).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Select label="Machine (optional)" value={v.machineId} onChange={(e) => setV({ ...v, machineId: e.target.value })} error={fields.machineId} hint="Machines without a node">
          <option value="">Not assigned yet</option>
          {free.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Input wrapClassName="col-span-2 max-md:col-span-1" label="Mounting note" value={v.mountingNote} onChange={(e) => setV({ ...v, mountingNote: e.target.value })} error={fields.mountingNote} placeholder="e.g. drive-end bearing housing" />
      </div>
    </Modal>
  );
}
