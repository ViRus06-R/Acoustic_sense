// Shared read queries used by several endpoints.
import { q } from "./db";
import { getSetting } from "./settings";
import { deriveNodeStatus, type MachineStatus } from "@/lib/shared/domain";

export interface MachineRow {
  id: number;
  name: string;
  type: string;
  notes: string;
  site: { id: number; name: string };
  line: { id: number; name: string } | null;
  node: { id: string; status: string; lastHeartbeatAt: string | null } | null;
  status: MachineStatus;
  score: number | null;
  threshold: number | null;
  lastEventAt: string | null;
  sparkline: number[];
}

export async function listMachines(f: { siteIds: number[]; lineId?: number | null; type?: string | null; ids?: number[] }): Promise<MachineRow[]> {
  if (f.siteIds.length === 0) return [];
  const det = await getSetting("detection");
  const rows = await q<{
    id: number;
    name: string;
    type: string;
    notes: string;
    site_id: number;
    site_name: string;
    line_id: number | null;
    line_name: string | null;
    node_id: string | null;
    last_heartbeat_at: Date | null;
    rssi: number | null;
    pending: number | null;
    status: MachineStatus;
    score: number | null;
    threshold: number | null;
    last_event_at: Date | null;
  }>(
    `SELECT m.id, m.name, m.type, m.notes, m.site_id, s.name site_name, m.line_id, l.name line_name,
            n.id node_id, n.last_heartbeat_at, n.rssi, n.pending, m.status, m.score, n.threshold, m.last_event_at
       FROM machines m
       JOIN sites s ON s.id = m.site_id
       LEFT JOIN lines l ON l.id = m.line_id
       LEFT JOIN nodes n ON n.machine_id = m.id AND n.decommissioned_at IS NULL
      WHERE m.archived_at IS NULL AND m.site_id = ANY($1)
        AND ($2::int IS NULL OR m.line_id = $2)
        AND ($3::text IS NULL OR m.type = $3)
        AND ($4::int[] IS NULL OR m.id = ANY($4))`,
    [f.siteIds, f.lineId ?? null, f.type ?? null, f.ids ?? null],
  );
  const nodeIds = rows.map((r) => r.node_id).filter(Boolean) as string[];
  const spark = new Map<string, number[]>();
  if (nodeIds.length) {
    // 24 hourly means over the last 24 h, aggregated in SQL.
    const pts = await q<{ node_id: string; b: number; v: number }>(
      `SELECT node_id, floor(extract(epoch FROM (now() - event_time)) / 3600)::int b, avg(score) v
         FROM telemetry WHERE node_id = ANY($1) AND event_time > now() - interval '24 hours' AND score IS NOT NULL
        GROUP BY node_id, b`,
      [nodeIds],
    );
    for (const p of pts) {
      if (!spark.has(p.node_id)) spark.set(p.node_id, new Array(24).fill(NaN));
      const arr = spark.get(p.node_id)!;
      const idx = 23 - Math.min(23, p.b);
      arr[idx] = Math.round(p.v * 10000) / 10000;
    }
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    notes: r.notes,
    site: { id: r.site_id, name: r.site_name },
    line: r.line_id ? { id: r.line_id, name: r.line_name! } : null,
    node: r.node_id
      ? {
          id: r.node_id,
          status: deriveNodeStatus({ lastHeartbeatAt: r.last_heartbeat_at, rssi: r.rssi, pending: r.pending ?? 0, heartbeatTimeoutSec: det.heartbeatTimeoutSec }),
          lastHeartbeatAt: r.last_heartbeat_at?.toISOString() ?? null,
        }
      : null,
    status: r.status,
    score: r.score,
    threshold: r.threshold,
    lastEventAt: r.last_event_at?.toISOString() ?? null,
    sparkline: (r.node_id ? spark.get(r.node_id) : undefined)?.map((v) => (Number.isNaN(v) ? null : v)).filter((v): v is number => v !== null) ?? [],
  }));
}

/** Bucket size per chart range. */
export function rangeSpec(range: string | null) {
  switch (range) {
    case "1h":
      return { interval: "1 hour", bucketSec: 60, label: "1 h" };
    case "7d":
      return { interval: "7 days", bucketSec: 3600, label: "7 d" };
    case "30d":
      return { interval: "30 days", bucketSec: 3 * 3600, label: "30 d" };
    case "24h":
    default:
      return { interval: "24 hours", bucketSec: 600, label: "24 h" };
  }
}

export async function scoreSeries(nodeIds: string[], range: string | null) {
  const r = rangeSpec(range);
  if (!nodeIds.length) return [];
  return q<{ t: Date; v: number; max: number }>(
    `SELECT to_timestamp(floor(extract(epoch FROM event_time) / $2) * $2) t, avg(score) v, max(score) max
       FROM telemetry WHERE node_id = ANY($1) AND score IS NOT NULL AND event_time > now() - $3::interval
      GROUP BY 1 ORDER BY 1`,
    [nodeIds, r.bucketSec, r.interval],
  );
}
