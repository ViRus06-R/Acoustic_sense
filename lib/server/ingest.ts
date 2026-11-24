import { z } from "zod";
import { q, q1 } from "./db";
import { detectionConfig, getSetting } from "./settings";
import { publish } from "./realtime";
import { notifyAlert } from "./notify";
import { classifySeverity, deliveredVia, OFFLINE_SYNC_LAG_MS, type AlertSeverity, type MachineStatus } from "@/lib/shared/domain";

// Message contracts (see docs/mqtt-contract.md).
const isoTime = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  if (isNaN(d.getTime())) {
    ctx.addIssue({ code: "custom", message: "invalid event_time" });
    return z.NEVER;
  }
  return d;
});

export const telemetrySchema = z.object({
  node_id: z.string().regex(/^AS-N-\d{3}$/),
  seq: z.number().int().nonnegative(),
  event_time: isoTime,
  fw: z.string().max(32).optional(),
  model: z.string().max(80).optional(),
  rssi: z.number().int().min(-127).max(0).optional(),
  infer_ms: z.number().min(0).max(100000).optional(),
  pending: z.number().int().min(0).optional(),
  status: z.string().max(32).optional(),
  score: z.number().min(0).max(1000).optional(),
});

export const alertSchema = z.object({
  node_id: z.string().regex(/^AS-N-\d{3}$/),
  seq: z.number().int().nonnegative(),
  event_time: isoTime,
  anomaly_score: z.number().min(0).max(1000),
  threshold: z.number().min(0).max(1000),
  status: z.enum(["normal", "warning", "anomaly"]),
});

interface NodeRow {
  id: string;
  site_id: number;
  slug: string;
  machine_id: number | null;
  threshold: number;
  persistence: number | null;
  last_heartbeat_at: Date | null;
  decommissioned_at: Date | null;
}

async function loadNode(nodeId: string): Promise<NodeRow | null> {
  return q1<NodeRow>(
    `SELECT n.id, n.site_id, s.slug, n.machine_id, n.threshold, n.persistence, n.last_heartbeat_at, n.decommissioned_at
       FROM nodes n JOIN sites s ON s.id = n.site_id WHERE n.id = $1`,
    [nodeId],
  );
}

/** Topic: {prefix}/{site}/{node}/{telemetry|alert}. Returns the parsed parts or null. */
export function parseTopic(topic: string, prefix: string) {
  const p = topic.split("/");
  if (p.length !== 4 || p[0] !== prefix) return null;
  if (p[3] !== "telemetry" && p[3] !== "alert") return null;
  return { site: p[1], node: p[2], kind: p[3] as "telemetry" | "alert" };
}

// Messages of one node are processed strictly one after another (offline-log bursts arrive
// all at once); otherwise de-duplication and sync-history lookups would race.
type G = typeof globalThis & { __asNodeQueues?: Map<string, Promise<unknown>> };
const gq = globalThis as G;
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const queues = (gq.__asNodeQueues ??= new Map());
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  queues.set(key, next);
  void next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  }).catch(() => {});
  return next;
}

export function handleMessage(topic: string, payload: Buffer | string) {
  const node = topic.split("/")[2] ?? "";
  return serial(node, () => handleMessageNow(topic, payload));
}

async function handleMessageNow(topic: string, payload: Buffer | string) {
  const broker = await getSetting("broker");
  const t = parseTopic(topic, broker.topicPrefix);
  if (!t) return { ok: false, reason: "topic" };
  let json: unknown;
  try {
    json = JSON.parse(payload.toString());
  } catch {
    return { ok: false, reason: "json" };
  }
  const receivedAt = new Date();
  if (t.kind === "telemetry") {
    const m = telemetrySchema.safeParse(json);
    if (!m.success || m.data.node_id !== t.node) return { ok: false, reason: "schema" };
    return ingestTelemetry(m.data, t.site, receivedAt);
  }
  const m = alertSchema.safeParse(json);
  if (!m.success || m.data.node_id !== t.node) return { ok: false, reason: "schema" };
  return ingestAlert(m.data, t.site, receivedAt);
}

async function recordSync(nodeId: string, eventTime: Date, receivedAt: Date) {
  if (receivedAt.getTime() - eventTime.getTime() <= OFFLINE_SYNC_LAG_MS) return;
  const open = await q1<{ id: number }>(
    "SELECT id FROM sync_history WHERE node_id = $1 AND received_at > now() - interval '90 seconds' ORDER BY received_at DESC LIMIT 1",
    [nodeId],
  );
  if (open) {
    await q(
      "UPDATE sync_history SET events_synced = events_synced + 1, outage_start = LEAST(outage_start, $2), outage_end = GREATEST(outage_end, $2), received_at = now() WHERE id = $1",
      [open.id, eventTime],
    );
  } else {
    await q("INSERT INTO sync_history(node_id, events_synced, outage_start, outage_end) VALUES ($1, 1, $2, $2)", [nodeId, eventTime]);
  }
}

export async function ingestTelemetry(m: z.infer<typeof telemetrySchema>, siteSlug: string, receivedAt: Date) {
  const node = await loadNode(m.node_id);
  if (!node || node.decommissioned_at || node.slug !== siteSlug) return { ok: false, reason: "unknown-node" };
  const eventTime = m.event_time.getTime() > receivedAt.getTime() + 5000 ? receivedAt : m.event_time;
  const ins = await q(
    `INSERT INTO telemetry(node_id, seq, event_time, received_at, rssi, infer_ms, pending, score, fw, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (node_id, seq) DO NOTHING RETURNING id`,
    [m.node_id, m.seq, eventTime, receivedAt, m.rssi ?? null, m.infer_ms ?? null, m.pending ?? null, m.score ?? null, m.fw ?? null, m.status ?? null],
  );
  if (ins.length === 0) return { ok: true, duplicate: true };
  await recordSync(m.node_id, eventTime, receivedAt);

  const isLatest = !node.last_heartbeat_at || eventTime >= node.last_heartbeat_at;
  if (isLatest) {
    await q(
      `UPDATE nodes SET last_heartbeat_at = $2, firmware = COALESCE($3, firmware), model = COALESCE($4, model),
              rssi = COALESCE($5, rssi), inference_ms = COALESCE($6, inference_ms), pending = COALESCE($7, pending)
        WHERE id = $1`,
      [m.node_id, eventTime, m.fw ?? null, m.model ?? null, m.rssi ?? null, m.infer_ms ?? null, m.pending ?? null],
    );
  }
  if (node.machine_id) await refreshMachineStatus(node.machine_id, { autoResolveOffline: true });
  publish({ type: "node", nodeId: m.node_id, siteId: node.site_id });
  return { ok: true };
}

/** Re-evaluate the machine status with the shared severity rule and push it live. */
export async function refreshMachineStatus(machineId: number, opts: { autoResolveOffline?: boolean } = {}): Promise<MachineStatus | null> {
  const node = await q1<{ id: string; threshold: number; persistence: number | null; last_heartbeat_at: Date | null; site_id: number }>(
    "SELECT id, threshold, persistence, last_heartbeat_at, site_id FROM nodes WHERE machine_id = $1 AND decommissioned_at IS NULL",
    [machineId],
  );
  const machine = await q1<{ status: MachineStatus; score: number | null; site_id: number }>("SELECT status, score, site_id FROM machines WHERE id = $1", [machineId]);
  if (!machine) return null;
  if (!node) {
    if (machine.status !== "Offline") await q("UPDATE machines SET status = 'Offline' WHERE id = $1", [machineId]);
    return "Offline";
  }
  const cfg = await detectionConfig(node.persistence);
  const rows = await q<{ score: number }>(
    "SELECT score FROM telemetry WHERE node_id = $1 AND score IS NOT NULL ORDER BY event_time DESC LIMIT $2",
    [node.id, cfg.persistenceWindows + cfg.risingWindows + 2],
  );
  const scores = rows.map((r) => r.score).reverse();
  const status = classifySeverity({ scores, threshold: node.threshold, lastHeartbeatAt: node.last_heartbeat_at, cfg });
  const score = scores.length ? scores[scores.length - 1] : machine.score;
  if (status !== machine.status || score !== machine.score) {
    await q("UPDATE machines SET status = $2, score = $3 WHERE id = $1", [machineId, status, score]);
    publish({ type: "machine", machineId, siteId: machine.site_id, status, score });
  }
  if (opts.autoResolveOffline && machine.status === "Offline" && status !== "Offline") {
    const resolved = await q<{ id: number }>(
      `UPDATE alerts SET status = 'Resolved', resolved_at = now(), action_taken = 'Auto-resolved: heartbeat restored'
        WHERE node_id = $1 AND severity = 'Offline' AND status <> 'Resolved' RETURNING id`,
      [node.id],
    );
    for (const r of resolved) publish({ type: "alert", alertId: r.id, siteId: node.site_id, severity: "Offline", action: "updated" });
  }
  return status;
}

export async function ingestAlert(m: z.infer<typeof alertSchema>, siteSlug: string, receivedAt: Date) {
  const node = await loadNode(m.node_id);
  if (!node || node.decommissioned_at || node.slug !== siteSlug) return { ok: false, reason: "unknown-node" };
  const eventTime = m.event_time.getTime() > receivedAt.getTime() + 5000 ? receivedAt : m.event_time;
  const ins = await q<{ id: number }>(
    `INSERT INTO alert_messages(node_id, seq, event_time, received_at, score, threshold, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (node_id, seq) DO NOTHING RETURNING id`,
    [m.node_id, m.seq, eventTime, receivedAt, m.anomaly_score, m.threshold, m.status],
  );
  if (ins.length === 0) return { ok: true, duplicate: true };
  await recordSync(m.node_id, eventTime, receivedAt);
  if (m.status === "normal") return { ok: true };

  const severity: AlertSeverity = m.status === "anomaly" ? "Anomaly" : "Warning";
  const via = deliveredVia(eventTime, receivedAt);
  const det = await getSetting("detection");

  // De-duplicate: extend an unresolved alert of this node seen within the window.
  const existing = await q1<{ id: number; severity: AlertSeverity }>(
    `SELECT id, severity FROM alerts WHERE node_id = $1 AND status <> 'Resolved' AND severity IN ('Warning','Anomaly')
       AND last_event_at >= $2::timestamptz - make_interval(mins => $3) ORDER BY detected_at DESC LIMIT 1`,
    [m.node_id, eventTime, det.dedupWindowMin],
  );
  let alertId: number;
  let notify = false;
  if (existing) {
    const upgrade = existing.severity === "Warning" && severity === "Anomaly";
    await q(
      `UPDATE alerts SET windows = windows + 1, score = GREATEST(score, $2), threshold = $3,
              last_event_at = GREATEST(last_event_at, $4), detected_at = LEAST(detected_at, $4),
              severity = CASE WHEN $5 THEN 'Anomaly' ELSE severity END,
              delivered_via = CASE WHEN $6 = 'Offline log sync' THEN $6 ELSE delivered_via END
        WHERE id = $1`,
      [existing.id, m.anomaly_score, m.threshold, eventTime, upgrade, via],
    );
    alertId = existing.id;
    notify = upgrade;
  } else {
    const r = await q1<{ id: number }>(
      `INSERT INTO alerts(node_id, machine_id, site_id, severity, score, threshold, detected_at, last_event_at, received_at, delivered_via)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9) RETURNING id`,
      [m.node_id, node.machine_id, node.site_id, severity, m.anomaly_score, m.threshold, eventTime, receivedAt, via],
    );
    alertId = r!.id;
    notify = true;
  }
  if (node.machine_id) await q("UPDATE machines SET last_event_at = GREATEST(last_event_at, $2) WHERE id = $1", [node.machine_id, eventTime]);
  publish({ type: "alert", alertId, siteId: node.site_id, severity, action: existing ? "updated" : "created" });
  if (notify) {
    const machine = node.machine_id ? await q1<{ name: string }>("SELECT name FROM machines WHERE id = $1", [node.machine_id]) : null;
    await notifyAlert({
      id: alertId,
      severity: existing ? "Anomaly" : severity,
      site_id: node.site_id,
      score: m.anomaly_score,
      threshold: m.threshold,
      machine_name: machine?.name ?? null,
      node_id: m.node_id,
    });
  }
  return { ok: true, alertId };
}

/** Periodic job: Offline detection (heartbeat timeout from Settings) and Anomaly escalation. */
export async function runMonitorTick() {
  const det = await getSetting("detection");
  const stale = await q<{ id: string; machine_id: number | null; site_id: number; last_heartbeat_at: Date | null; machine_status: string | null; machine_name: string | null }>(
    `SELECT n.id, n.machine_id, n.site_id, n.last_heartbeat_at, m.status machine_status, m.name machine_name
       FROM nodes n LEFT JOIN machines m ON m.id = n.machine_id
      WHERE n.decommissioned_at IS NULL
        AND (n.last_heartbeat_at IS NULL OR n.last_heartbeat_at < now() - make_interval(secs => $1))
        AND (m.id IS NULL OR m.status <> 'Offline')`,
    [det.heartbeatTimeoutSec],
  );
  for (const n of stale) {
    if (n.machine_id) {
      await q("UPDATE machines SET status = 'Offline' WHERE id = $1", [n.machine_id]);
      publish({ type: "machine", machineId: n.machine_id, siteId: n.site_id, status: "Offline", score: null });
    }
    const open = await q1("SELECT id FROM alerts WHERE node_id = $1 AND severity = 'Offline' AND status <> 'Resolved'", [n.id]);
    if (!open && n.last_heartbeat_at) {
      const r = await q1<{ id: number }>(
        `INSERT INTO alerts(node_id, machine_id, site_id, severity, detected_at, last_event_at, delivered_via)
         VALUES ($1,$2,$3,'Offline', now(), now(), 'MQTT live') RETURNING id`,
        [n.id, n.machine_id, n.site_id],
      );
      publish({ type: "alert", alertId: r!.id, siteId: n.site_id, severity: "Offline", action: "created" });
      await notifyAlert({ id: r!.id, severity: "Offline", site_id: n.site_id, score: null, threshold: null, machine_name: n.machine_name, node_id: n.id });
    }
    publish({ type: "node", nodeId: n.id, siteId: n.site_id });
  }

  // Machines that were Offline but whose node is back (e.g. timeout increased) get re-evaluated.
  const back = await q<{ machine_id: number }>(
    `SELECT n.machine_id FROM nodes n JOIN machines m ON m.id = n.machine_id
      WHERE n.decommissioned_at IS NULL AND m.status = 'Offline' AND n.last_heartbeat_at >= now() - make_interval(secs => $1)`,
    [det.heartbeatTimeoutSec],
  );
  for (const b of back) await refreshMachineStatus(b.machine_id, { autoResolveOffline: true });

  const notif = await getSetting("notifications");
  if (notif.escalation.enabled) {
    const overdue = await q<{ id: number; site_id: number; score: number; threshold: number; node_id: string; machine_name: string | null }>(
      `UPDATE alerts a SET escalated_at = now() FROM (
          SELECT a2.id FROM alerts a2 WHERE a2.status = 'Open' AND a2.severity = 'Anomaly' AND a2.escalated_at IS NULL
             AND a2.detected_at < now() - make_interval(mins => $1) AND a2.detected_at > now() - interval '1 day'
        ) x WHERE a.id = x.id
        RETURNING a.id, a.site_id, a.score, a.threshold, a.node_id, (SELECT name FROM machines WHERE id = a.machine_id) machine_name`,
      [notif.escalation.minutes],
    );
    for (const a of overdue) {
      await notifyAlert({ ...a, severity: "Anomaly" }, { escalation: true });
    }
  }
}
