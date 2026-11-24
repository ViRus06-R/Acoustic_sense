import { q, q1 } from "./db";
import { alertCode } from "@/lib/shared/domain";
import type { NextRequest } from "next/server";
import type { AuthUser } from "./auth";
import { scopeSites } from "./http";

export interface AlertFilters {
  siteIds: number[];
  status?: string | null;
  severity?: string | null;
  machineId?: number | null;
  nodeId?: string | null;
  lineId?: number | null;
  days?: number | null;
  q?: string | null;
}

function where(f: AlertFilters) {
  const params: unknown[] = [f.siteIds];
  const w = ["a.site_id = ANY($1)"];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    w.push(sql.replace("?", `$${params.length}`));
  };
  if (f.status && f.status !== "All") add("a.status = ?", f.status);
  if (f.severity && f.severity !== "All") add("a.severity = ?", f.severity);
  if (f.machineId) add("a.machine_id = ?", f.machineId);
  if (f.nodeId) add("a.node_id = ?", f.nodeId);
  if (f.lineId) add("m.line_id = ?", f.lineId);
  if (f.days) add("a.detected_at > now() - make_interval(days => ?)", f.days);
  if (f.q) {
    params.push(`%${f.q.replace(/[%_\\]/g, "")}%`);
    w.push(`(m.name ILIKE $${params.length} OR a.node_id ILIKE $${params.length})`);
  }
  return { sql: w.join(" AND "), params };
}

const SELECT = `
  SELECT a.id, a.severity, a.status, a.score, a.threshold, a.windows, a.detected_at "detectedAt", a.last_event_at "lastEventAt",
         a.received_at "receivedAt", a.delivered_via "deliveredVia", a.node_id "nodeId", a.machine_id "machineId", m.name machine,
         s.name site, l.name line, a.site_id "siteId",
         EXTRACT(EPOCH FROM (a.last_event_at - a.detected_at))::int + 10 "durationSec",
         a.assignee_id "assigneeId", ua.name assignee,
         a.acknowledged_at "acknowledgedAt", uk.name "acknowledgedBy",
         a.resolved_at "resolvedAt", ur.name "resolvedBy",
         a.action_taken "actionTaken", a.notes, a.downtime_min "downtimeMin", a.parts_used "partsUsed",
         a.recalibrate_after_fix "recalibrateAfterFix"
    FROM alerts a
    LEFT JOIN machines m ON m.id = a.machine_id
    LEFT JOIN lines l ON l.id = m.line_id
    JOIN sites s ON s.id = a.site_id
    LEFT JOIN users ua ON ua.id = a.assignee_id
    LEFT JOIN users uk ON uk.id = a.acknowledged_by
    LEFT JOIN users ur ON ur.id = a.resolved_by`;

export interface AlertRow {
  id: number;
  code: string;
  severity: string;
  status: string;
  score: number | null;
  threshold: number | null;
  windows: number;
  detectedAt: Date;
  lastEventAt: Date;
  receivedAt: Date;
  deliveredVia: string;
  nodeId: string;
  machineId: number | null;
  machine: string | null;
  site: string;
  line: string | null;
  siteId: number;
  durationSec: number;
  assigneeId: number | null;
  assignee: string | null;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  actionTaken: string | null;
  notes: string | null;
  downtimeMin: number | null;
  partsUsed: string | null;
  recalibrateAfterFix: boolean;
}

export async function listAlerts(f: AlertFilters, page = 1, pageSize = 25) {
  const w = where(f);
  const total = await q1<{ n: number }>(
    `SELECT count(*)::int n FROM alerts a LEFT JOIN machines m ON m.id = a.machine_id WHERE ${w.sql}`,
    w.params as never[],
  );
  const rows = await q<Omit<AlertRow, "code">>(
    `${SELECT} WHERE ${w.sql} ORDER BY (a.status = 'Resolved'), a.detected_at DESC LIMIT ${Number(pageSize)} OFFSET ${(Number(page) - 1) * Number(pageSize)}`,
    w.params as never[],
  );
  return { items: rows.map((r) => ({ ...r, code: alertCode(r.id) })), total: total?.n ?? 0 };
}

export async function iterateAlerts(f: AlertFilters, batch = 1000) {
  const w = where(f);
  async function* gen() {
    for (let offset = 0; ; offset += batch) {
      const rows = await q<Omit<AlertRow, "code">>(`${SELECT} WHERE ${w.sql} ORDER BY a.detected_at DESC LIMIT ${batch} OFFSET ${offset}`, w.params as never[]);
      for (const r of rows) yield { ...r, code: alertCode(r.id) };
      if (rows.length < batch) return;
    }
  }
  return gen();
}

export async function getAlert(id: number) {
  const r = await q1<Omit<AlertRow, "code">>(`${SELECT} WHERE a.id = $1`, [id]);
  return r ? { ...r, code: alertCode(r.id) } : null;
}

export async function alertSummary(siteIds: number[]) {
  return q1<{ open: number; acknowledged: number; resolvedMonth: number }>(
    `SELECT count(*) FILTER (WHERE status = 'Open')::int open,
            count(*) FILTER (WHERE status = 'Acknowledged')::int acknowledged,
            count(*) FILTER (WHERE status = 'Resolved' AND resolved_at >= date_trunc('month', now()))::int "resolvedMonth"
       FROM alerts WHERE site_id = ANY($1)`,
    [siteIds],
  );
}

export function alertFiltersFrom(req: NextRequest, user: AuthUser) {
  const sp = req.nextUrl.searchParams;
  const days = sp.get("range") === "all" ? null : Number(sp.get("range") ?? 7) || 7;
  return {
    siteIds: scopeSites(user, sp.get("site")),
    lineId: sp.get("line") ? Number(sp.get("line")) : null,
    status: sp.get("status"),
    severity: sp.get("severity"),
    machineId: sp.get("machine") ? Number(sp.get("machine")) : null,
    nodeId: sp.get("node"),
    days,
    q: sp.get("q"),
  };
}

