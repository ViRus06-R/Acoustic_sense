import { NextResponse } from "next/server";
import { z } from "zod";
import { q, q1 } from "@/lib/server/db";
import { route, body, param, notFound, assertSite } from "@/lib/server/http";
import { listNodes, loadNode, topicsFor } from "@/lib/server/nodes";
import { audit, diff } from "@/lib/server/audit";
import { getSetting } from "@/lib/server/settings";
import { refreshMachineStatus } from "@/lib/server/ingest";
import { listAlerts } from "@/lib/server/alerts";
import { publish } from "@/lib/server/realtime";

async function guard(userSites: number[], id: string) {
  const n = await loadNode(id);
  if (!n || n.decommissioned_at) throw notFound("Node not found");
  if (!userSites.includes(n.site_id)) throw notFound("Node not found");
  return n;
}

export const GET = route({}, async (_req, { user, params }) => {
  const id = param(params, "id");
  const n = await guard(user.siteIds, id);
  const { rows } = await listNodes([n.site_id]);
  const row = rows.find((r) => r.id === id)!;
  const extra = await q1<{ registered_at: Date; recalibration_requested_at: Date | null; threshold_calibrated: boolean; heartbeat_interval: number; persistence: number | null }>(
    "SELECT registered_at, recalibration_requested_at, threshold_calibrated, heartbeat_interval, persistence FROM nodes WHERE id = $1",
    [id],
  );
  const det = await getSetting("detection");
  const events = await listAlerts({ siteIds: [n.site_id], nodeId: id }, 1, 10);
  return NextResponse.json({
    ...row,
    registeredAt: extra!.registered_at,
    recalibrationRequestedAt: extra!.recalibration_requested_at,
    thresholdCalibrated: extra!.threshold_calibrated,
    config: { threshold: row.threshold, persistence: extra!.persistence ?? det.persistenceWindows, persistenceIsDefault: extra!.persistence == null, heartbeatInterval: extra!.heartbeat_interval },
    topics: await topicsFor(n.slug, id),
    recentEvents: events.items,
  });
});

const configSchema = z.object({
  threshold: z.number().min(0.0001, "Must be > 0").max(10, "Max 10"),
  persistence: z.number().int().min(1, "Min 1").max(120, "Max 120").nullable(),
  heartbeatInterval: z.number().int().min(1, "Min 1 s").max(3600, "Max 3600 s"),
});

/** Configuration (Admin + Maintenance Engineer). */
export const PATCH = route({ roles: ["admin", "engineer"] }, async (req, { user, params }) => {
  const id = param(params, "id");
  const n = await guard(user.siteIds, id);
  const b = await body(req, configSchema);
  await q("UPDATE nodes SET threshold = $2, persistence = $3, heartbeat_interval = $4, threshold_calibrated = threshold_calibrated AND $2 = threshold WHERE id = $1", [
    id,
    b.threshold,
    b.persistence,
    b.heartbeatInterval,
  ]);
  await audit(user, "node.config_updated", id, diff({ threshold: n.threshold, persistence: n.persistence, heartbeatInterval: n.heartbeat_interval }, b));
  if (n.machine_id) await refreshMachineStatus(n.machine_id);
  publish({ type: "node", nodeId: id, siteId: n.site_id });
  return NextResponse.json({ ok: true });
});

/** Decommission (Admin). History is kept; the machine is released. */
export const DELETE = route({ roles: ["admin"] }, async (_req, { user, params }) => {
  const id = param(params, "id");
  const n = await guard(user.siteIds, id);
  assertSite(user, n.site_id);
  await q("UPDATE nodes SET decommissioned_at = now(), machine_id = NULL, mqtt_password_hash = NULL WHERE id = $1", [id]);
  if (n.machine_id) await refreshMachineStatus(n.machine_id);
  await audit(user, "node.decommissioned", id);
  publish({ type: "node", nodeId: id, siteId: n.site_id });
  return NextResponse.json({ ok: true });
});
