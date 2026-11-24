import { z } from "zod";
import { q } from "./db";
import { badRequest } from "./http";
import type { AuthUser } from "./auth";
import { meanTimeToAcknowledge, meanTimeToResolve, formatMinutes, round2 } from "@/lib/shared/stats";
import { alertCode } from "@/lib/shared/domain";

export const REPORT_TYPES = ["alerts", "health", "downtime", "availability"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const reportParamsSchema = z.object({
  type: z.enum(REPORT_TYPES),
  from: z.string().datetime({ offset: true, message: "Invalid start date" }),
  to: z.string().datetime({ offset: true, message: "Invalid end date" }),
  siteIds: z.array(z.number().int().positive()).max(50).default([]),
  lines: z.array(z.number().int().positive()).max(200).default([]),
  machineIds: z.array(z.number().int().positive()).max(500).default([]),
  severities: z.array(z.enum(["Warning", "Anomaly", "Offline"])).max(3).default([]),
  rangeLabel: z.string().max(40).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(5000).default(15),
});
export type ReportParams = z.infer<typeof reportParamsSchema>;

export const REPORT_TITLES: Record<ReportType, string> = {
  alerts: "Alert summary",
  health: "Machine health",
  downtime: "Downtime and maintenance",
  availability: "Node availability",
};

export interface Column {
  key: string;
  label: string;
  type?: "text" | "number" | "score" | "datetime" | "percent" | "minutes" | "status" | "severity";
}

export function validateRange(p: ReportParams) {
  const from = new Date(p.from);
  const to = new Date(p.to);
  if (!(from < to)) throw badRequest("The start date must be before the end date.", { from: "Must be before the end date" });
  if (to.getTime() - from.getTime() > 366 * 86400_000) throw badRequest("The maximum range is 12 months.", { to: "Max 12 months" });
  if (from.getTime() > Date.now()) throw badRequest("The start date is in the future.", { from: "In the future" });
  return { from, to };
}

function scope(user: AuthUser, p: ReportParams) {
  const siteIds = p.siteIds.length ? p.siteIds.filter((s) => user.siteIds.includes(s)) : user.siteIds;
  return { siteIds, lines: p.lines.length ? p.lines : null, machines: p.machineIds.length ? p.machineIds : null, sev: p.severities.length ? p.severities : null };
}

export interface ReportResult {
  title: string;
  summary: { label: string; value: string; tone?: string }[];
  charts: {
    id: string;
    title: string;
    kind: "bar" | "line" | "stacked";
    xKey: string;
    data: Record<string, unknown>[];
    series: { key: string; label: string; tone: string }[];
    threshold?: number | null;
  }[];
  columns: Column[];
  rows: Record<string, unknown>[];
}

export async function buildReport(user: AuthUser, p: ReportParams): Promise<ReportResult> {
  const { from, to } = validateRange(p);
  const s = scope(user, p);
  if (!s.siteIds.length) return { title: REPORT_TITLES[p.type], summary: [], charts: [], columns: [], rows: [] };
  switch (p.type) {
    case "alerts":
      return alertReport(s, from, to);
    case "health":
      return healthReport(s, from, to);
    case "downtime":
      return downtimeReport(s, from, to);
    case "availability":
      return availabilityReport(s, from, to);
  }
}

type Scope = ReturnType<typeof scope>;

const ALERT_SCOPE = `a.site_id = ANY($1) AND a.detected_at >= $2 AND a.detected_at < $3
  AND ($4::int[] IS NULL OR m.line_id = ANY($4)) AND ($5::int[] IS NULL OR a.machine_id = ANY($5)) AND ($6::text[] IS NULL OR a.severity = ANY($6))`;

async function alertReport(s: Scope, from: Date, to: Date): Promise<ReportResult> {
  const args = [s.siteIds, from, to, s.lines, s.machines, s.sev];
  const rows = await q<{ id: number; detected_at: Date; acknowledged_at: Date | null; resolved_at: Date | null; machine: string | null; node_id: string; severity: string; status: string; score: number | null; threshold: number | null }>(
    `SELECT a.id, a.detected_at, a.acknowledged_at, a.resolved_at, m.name machine, a.node_id, a.severity, a.status, a.score, a.threshold
       FROM alerts a LEFT JOIN machines m ON m.id = a.machine_id WHERE ${ALERT_SCOPE} ORDER BY a.detected_at DESC`,
    args as never[],
  );
  const times = rows.map((r) => ({ detectedAt: r.detected_at, acknowledgedAt: r.acknowledged_at, resolvedAt: r.resolved_at }));
  const mtta = meanTimeToAcknowledge(times);
  const mttr = meanTimeToResolve(times);
  const count = (k: "severity" | "status", v: string) => rows.filter((r) => r[k] === v).length;
  const perDay = await q<{ d: string; warning: number; anomaly: number; offline: number }>(
    `SELECT to_char(date_trunc('day', a.detected_at AT TIME ZONE 'Asia/Karachi'), 'DD Mon') d,
            count(*) FILTER (WHERE a.severity='Warning')::int warning, count(*) FILTER (WHERE a.severity='Anomaly')::int anomaly,
            count(*) FILTER (WHERE a.severity='Offline')::int offline
       FROM alerts a LEFT JOIN machines m ON m.id = a.machine_id WHERE ${ALERT_SCOPE}
      GROUP BY date_trunc('day', a.detected_at AT TIME ZONE 'Asia/Karachi') ORDER BY date_trunc('day', a.detected_at AT TIME ZONE 'Asia/Karachi')`,
    args as never[],
  );
  const top = await q<{ machine: string; n: number }>(
    `SELECT COALESCE(m.name, a.node_id) machine, count(*)::int n FROM alerts a LEFT JOIN machines m ON m.id = a.machine_id
      WHERE ${ALERT_SCOPE} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 8`,
    args as never[],
  );
  return {
    title: REPORT_TITLES.alerts,
    summary: [
      { label: "Alerts", value: String(rows.length) },
      { label: "Anomaly", value: String(count("severity", "Anomaly")), tone: "danger" },
      { label: "Warning", value: String(count("severity", "Warning")), tone: "warning" },
      { label: "Offline", value: String(count("severity", "Offline")), tone: "offline" },
      { label: "Open / Ack. / Resolved", value: `${count("status", "Open")} / ${count("status", "Acknowledged")} / ${count("status", "Resolved")}` },
      { label: "Mean time to acknowledge", value: formatMinutes(mtta) },
      { label: "Mean time to resolve", value: formatMinutes(mttr) },
    ],
    charts: [
      {
        id: "per-day",
        title: "Alerts per day by severity",
        kind: "stacked",
        xKey: "d",
        data: perDay,
        series: [
          { key: "anomaly", label: "Anomaly", tone: "danger" },
          { key: "warning", label: "Warning", tone: "warning" },
          { key: "offline", label: "Offline", tone: "offline" },
        ],
      },
      { id: "top", title: "Top machines by alerts", kind: "bar", xKey: "machine", data: top, series: [{ key: "n", label: "Alerts", tone: "teal" }] },
    ],
    columns: [
      { key: "code", label: "Alert" },
      { key: "detectedAt", label: "Detected", type: "datetime" },
      { key: "machine", label: "Machine" },
      { key: "nodeId", label: "Node" },
      { key: "severity", label: "Severity", type: "severity" },
      { key: "score", label: "Score", type: "score" },
      { key: "threshold", label: "Threshold", type: "score" },
      { key: "status", label: "Status", type: "status" },
      { key: "ttaMin", label: "Time to ack. (min)", type: "minutes" },
      { key: "ttrMin", label: "Time to resolve (min)", type: "minutes" },
    ],
    rows: rows.map((r) => ({
      code: alertCode(r.id),
      detectedAt: r.detected_at,
      machine: r.machine,
      nodeId: r.node_id,
      severity: r.severity,
      score: r.score,
      threshold: r.threshold,
      status: r.status,
      ttaMin: r.acknowledged_at ? round2((r.acknowledged_at.getTime() - r.detected_at.getTime()) / 60000) : null,
      ttrMin: r.resolved_at ? round2((r.resolved_at.getTime() - r.detected_at.getTime()) / 60000) : null,
    })),
  };
}

async function healthReport(s: Scope, from: Date, to: Date): Promise<ReportResult> {
  const args = [s.siteIds, from, to, s.lines, s.machines];
  const rows = await q<{ machine: string; type: string; node_id: string; threshold: number; avg: number | null; max: number | null; above_sec: number; events: number }>(
    `WITH t AS (
       SELECT x.node_id, x.score, x.event_time,
              LEAST(EXTRACT(EPOCH FROM (LEAD(x.event_time) OVER (PARTITION BY x.node_id ORDER BY x.event_time) - x.event_time)), 600) gap
         FROM telemetry x JOIN nodes n ON n.id = x.node_id JOIN machines m ON m.id = n.machine_id
        WHERE m.site_id = ANY($1) AND m.archived_at IS NULL AND x.event_time >= $2 AND x.event_time < $3 AND x.score IS NOT NULL
          AND ($4::int[] IS NULL OR m.line_id = ANY($4)) AND ($5::int[] IS NULL OR m.id = ANY($5))
     )
     SELECT m.name machine, m.type, n.id node_id, n.threshold,
            avg(t.score) avg, max(t.score) max,
            COALESCE(sum(t.gap) FILTER (WHERE t.score > n.threshold), 0)::int above_sec,
            (SELECT count(*)::int FROM alerts a WHERE a.machine_id = m.id AND a.detected_at >= $2 AND a.detected_at < $3) events
       FROM machines m JOIN nodes n ON n.machine_id = m.id LEFT JOIN t ON t.node_id = n.id
      WHERE m.site_id = ANY($1) AND m.archived_at IS NULL AND ($4::int[] IS NULL OR m.line_id = ANY($4)) AND ($5::int[] IS NULL OR m.id = ANY($5))
      GROUP BY m.id, m.name, m.type, n.id, n.threshold ORDER BY max(t.score) / NULLIF(n.threshold, 0) DESC NULLS LAST, m.name`,
    args as never[],
  );
  const daily = await q<{ d: string; v: number }>(
    `SELECT to_char(date_trunc('day', x.event_time AT TIME ZONE 'Asia/Karachi'), 'DD Mon') d, round(avg(x.score)::numeric, 4)::float v
       FROM telemetry x JOIN nodes n ON n.id = x.node_id JOIN machines m ON m.id = n.machine_id
      WHERE m.site_id = ANY($1) AND x.event_time >= $2 AND x.event_time < $3 AND x.score IS NOT NULL
        AND ($4::int[] IS NULL OR m.line_id = ANY($4)) AND ($5::int[] IS NULL OR m.id = ANY($5))
      GROUP BY date_trunc('day', x.event_time AT TIME ZONE 'Asia/Karachi') ORDER BY date_trunc('day', x.event_time AT TIME ZONE 'Asia/Karachi')`,
    args as never[],
  );
  const thr = rows.length ? round2((rows.reduce((a, r) => a + r.threshold, 0) / rows.length) * 1000) / 1000 : null;
  const scored = rows.filter((r) => r.avg != null);
  return {
    title: REPORT_TITLES.health,
    summary: [
      { label: "Machines", value: String(rows.length) },
      { label: "Fleet mean score", value: scored.length ? (scored.reduce((a, r) => a + r.avg!, 0) / scored.length).toFixed(3) : "-" },
      { label: "Time above threshold", value: formatMinutes(rows.reduce((a, r) => a + r.above_sec, 0) / 60), tone: "danger" },
      { label: "Detection events", value: String(rows.reduce((a, r) => a + r.events, 0)) },
    ],
    charts: [
      { id: "daily", title: "Fleet mean anomaly score per day", kind: "line", xKey: "d", data: daily, series: [{ key: "v", label: "Mean score", tone: "teal" }], threshold: thr },
      {
        id: "above",
        title: "Time above threshold per machine (min)",
        kind: "bar",
        xKey: "machine",
        data: rows.filter((r) => r.above_sec > 0).slice(0, 10).map((r) => ({ machine: r.machine, min: Math.round(r.above_sec / 60) })),
        series: [{ key: "min", label: "Minutes", tone: "danger" }],
      },
    ],
    columns: [
      { key: "machine", label: "Machine" },
      { key: "type", label: "Type" },
      { key: "nodeId", label: "Node" },
      { key: "avg", label: "Average score", type: "score" },
      { key: "max", label: "Maximum score", type: "score" },
      { key: "threshold", label: "Threshold", type: "score" },
      { key: "aboveMin", label: "Time above threshold (min)", type: "minutes" },
      { key: "events", label: "Events", type: "number" },
    ],
    rows: rows.map((r) => ({ machine: r.machine, type: r.type, nodeId: r.node_id, avg: r.avg, max: r.max, threshold: r.threshold, aboveMin: Math.round(r.above_sec / 6) / 10, events: r.events })),
  };
}

async function downtimeReport(s: Scope, from: Date, to: Date): Promise<ReportResult> {
  const args = [s.siteIds, from, to, s.lines, s.machines, s.sev];
  const rows = await q<{ id: number; resolved_at: Date; detected_at: Date; machine: string | null; node_id: string; severity: string; action_taken: string | null; downtime_min: number | null; parts_used: string | null; resolved_by: string | null; notes: string | null }>(
    `SELECT a.id, a.resolved_at, a.detected_at, m.name machine, a.node_id, a.severity, a.action_taken, a.downtime_min, a.parts_used, u.name resolved_by, a.notes
       FROM alerts a LEFT JOIN machines m ON m.id = a.machine_id LEFT JOIN users u ON u.id = a.resolved_by
      WHERE a.status = 'Resolved' AND a.resolved_by IS NOT NULL AND ${ALERT_SCOPE.replaceAll("a.detected_at", "a.resolved_at")}
      ORDER BY a.resolved_at DESC`,
    args as never[],
  );
  const total = rows.reduce((a, r) => a + (r.downtime_min ?? 0), 0);
  const byMachine = new Map<string, number>();
  const byAction = new Map<string, number>();
  for (const r of rows) {
    byMachine.set(r.machine ?? r.node_id, (byMachine.get(r.machine ?? r.node_id) ?? 0) + (r.downtime_min ?? 0));
    if (r.action_taken) byAction.set(r.action_taken, (byAction.get(r.action_taken) ?? 0) + 1);
  }
  const topAction = [...byAction.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    title: REPORT_TITLES.downtime,
    summary: [
      { label: "Resolved with record", value: String(rows.length) },
      { label: "Total downtime", value: formatMinutes(total), tone: "danger" },
      { label: "Mean downtime", value: formatMinutes(rows.length ? total / rows.length : null) },
      { label: "Most common action", value: topAction ? `${topAction[0]} (${topAction[1]})` : "-" },
    ],
    charts: [
      {
        id: "machine",
        title: "Downtime per machine (min)",
        kind: "bar",
        xKey: "machine",
        data: [...byMachine.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([machine, min]) => ({ machine, min })),
        series: [{ key: "min", label: "Minutes", tone: "warning" }],
      },
      {
        id: "actions",
        title: "Actions taken",
        kind: "bar",
        xKey: "action",
        data: [...byAction.entries()].sort((a, b) => b[1] - a[1]).map(([action, n]) => ({ action, n })),
        series: [{ key: "n", label: "Count", tone: "teal" }],
      },
    ],
    columns: [
      { key: "code", label: "Alert" },
      { key: "resolvedAt", label: "Resolved", type: "datetime" },
      { key: "machine", label: "Machine" },
      { key: "severity", label: "Severity", type: "severity" },
      { key: "actionTaken", label: "Action taken" },
      { key: "downtimeMin", label: "Downtime (min)", type: "number" },
      { key: "partsUsed", label: "Parts used" },
      { key: "resolvedBy", label: "Resolved by" },
    ],
    rows: rows.map((r) => ({
      code: alertCode(r.id),
      resolvedAt: r.resolved_at,
      machine: r.machine ?? r.node_id,
      severity: r.severity,
      actionTaken: r.action_taken,
      downtimeMin: r.downtime_min,
      partsUsed: r.parts_used,
      resolvedBy: r.resolved_by,
    })),
  };
}

async function availabilityReport(s: Scope, from: Date, to: Date): Promise<ReportResult> {
  const end = new Date(Math.min(to.getTime(), Date.now()));
  const slots = Math.max(1, Math.floor((end.getTime() - from.getTime()) / 300_000));
  const args = [s.siteIds, from, end, s.lines, s.machines];
  const rows = await q<{ node_id: string; machine: string | null; firmware: string | null; pending: number; up_slots: number; offline_periods: number; synced: number; registered_at: Date }>(
    `SELECT n.id node_id, m.name machine, n.firmware, n.pending, n.registered_at,
            (SELECT count(DISTINCT floor(EXTRACT(EPOCH FROM x.event_time) / 300))::int FROM telemetry x WHERE x.node_id = n.id AND x.event_time >= $2 AND x.event_time < $3) up_slots,
            (SELECT count(*)::int FROM alerts a WHERE a.node_id = n.id AND a.severity = 'Offline' AND a.detected_at >= $2 AND a.detected_at < $3) offline_periods,
            (SELECT COALESCE(sum(events_synced), 0)::int FROM sync_history sh WHERE sh.node_id = n.id AND sh.received_at >= $2 AND sh.received_at < $3) synced
       FROM nodes n LEFT JOIN machines m ON m.id = n.machine_id
      WHERE n.decommissioned_at IS NULL AND n.site_id = ANY($1)
        AND ($4::int[] IS NULL OR COALESCE(m.line_id, n.line_id) = ANY($4)) AND ($5::int[] IS NULL OR m.id = ANY($5))
      ORDER BY n.id`,
    args as never[],
  );
  const out = rows.map((r) => {
    const start = Math.max(from.getTime(), r.registered_at.getTime());
    const possible = Math.max(1, Math.min(slots, Math.floor((end.getTime() - start) / 300_000)));
    return { ...r, uptime: Math.min(100, Math.round((r.up_slots / possible) * 1000) / 10) };
  });
  const fw = new Map<string, number>();
  for (const r of out) fw.set(r.firmware ?? "unknown", (fw.get(r.firmware ?? "unknown") ?? 0) + 1);
  return {
    title: REPORT_TITLES.availability,
    summary: [
      { label: "Nodes", value: String(out.length) },
      { label: "Mean uptime", value: out.length ? `${(out.reduce((a, r) => a + r.uptime, 0) / out.length).toFixed(1)} %` : "-", tone: "success" },
      { label: "Offline periods", value: String(out.reduce((a, r) => a + r.offline_periods, 0)), tone: "offline" },
      { label: "Offline events synced", value: String(out.reduce((a, r) => a + r.synced, 0)) },
      { label: "Pending now", value: String(out.reduce((a, r) => a + r.pending, 0)) },
      { label: "Firmware versions", value: [...fw.entries()].map(([k, v]) => `${k} x${v}`).join(", ") || "-" },
    ],
    charts: [
      {
        id: "uptime",
        title: "Uptime per node (%)",
        kind: "bar",
        xKey: "node",
        data: [...out].sort((a, b) => a.uptime - b.uptime).slice(0, 12).map((r) => ({ node: r.node_id, uptime: r.uptime })),
        series: [{ key: "uptime", label: "Uptime %", tone: "success" }],
      },
    ],
    columns: [
      { key: "nodeId", label: "Node" },
      { key: "machine", label: "Machine" },
      { key: "uptime", label: "Uptime", type: "percent" },
      { key: "offlinePeriods", label: "Offline periods", type: "number" },
      { key: "pending", label: "Pending events", type: "number" },
      { key: "synced", label: "Synced events", type: "number" },
      { key: "firmware", label: "Firmware" },
    ],
    rows: out.map((r) => ({ nodeId: r.node_id, machine: r.machine, uptime: r.uptime, offlinePeriods: r.offline_periods, pending: r.pending, synced: r.synced, firmware: r.firmware })),
  };
}
