import { NextResponse } from "next/server";
import { q1, tx } from "@/lib/server/db";
import { route, body, intParam, notFound, assertSite } from "@/lib/server/http";
import { listMachines } from "@/lib/server/repo";
import { machineSchema, validateMachine } from "@/lib/server/machines";
import { audit, diff } from "@/lib/server/audit";
import { refreshMachineStatus } from "@/lib/server/ingest";
import { getSetting } from "@/lib/server/settings";
import { deriveNodeStatus } from "@/lib/shared/domain";

async function load(id: number) {
  return q1<{ id: number; name: string; type: string; site_id: number; line_id: number | null; notes: string; archived_at: Date | null }>(
    "SELECT id, name, type, site_id, line_id, notes, archived_at FROM machines WHERE id = $1",
    [id],
  );
}

export const GET = route({}, async (_req, { user, params }) => {
  const id = intParam(params, "id");
  const m = await load(id);
  if (!m || m.archived_at) throw notFound("Machine not found");
  assertSite(user, m.site_id);
  const [row] = await listMachines({ siteIds: [m.site_id], ids: [id] });
  const node = await q1<{
    id: string;
    mounting_note: string;
    firmware: string | null;
    model: string | null;
    threshold: number;
    threshold_calibrated: boolean;
    inference_ms: number | null;
    rssi: number | null;
    pending: number;
    last_heartbeat_at: Date | null;
    recalibration_requested_at: Date | null;
  }>(
    `SELECT id, mounting_note, firmware, model, threshold, threshold_calibrated, inference_ms, rssi, pending, last_heartbeat_at, recalibration_requested_at
       FROM nodes WHERE machine_id = $1 AND decommissioned_at IS NULL`,
    [id],
  );
  const det = await getSetting("detection");
  return NextResponse.json({
    ...row,
    siteId: m.site_id,
    lineId: m.line_id,
    nodeDetail: node && {
      id: node.id,
      mountingNote: node.mounting_note,
      firmware: node.firmware,
      model: node.model,
      threshold: node.threshold,
      thresholdCalibrated: node.threshold_calibrated,
      inferenceMs: node.inference_ms,
      rssi: node.rssi,
      pending: node.pending,
      lastHeartbeatAt: node.last_heartbeat_at,
      recalibrationRequestedAt: node.recalibration_requested_at,
      status: deriveNodeStatus({ lastHeartbeatAt: node.last_heartbeat_at, rssi: node.rssi, pending: node.pending, heartbeatTimeoutSec: det.heartbeatTimeoutSec }),
    },
  });
});

export const PATCH = route({ roles: ["admin"] }, async (req, { user, params }) => {
  const id = intParam(params, "id");
  const m = await load(id);
  if (!m || m.archived_at) throw notFound("Machine not found");
  assertSite(user, m.site_id);
  const b = await body(req, machineSchema);
  assertSite(user, b.siteId);
  await validateMachine(b, id);
  const prevNode = await q1<{ id: string }>("SELECT id FROM nodes WHERE machine_id = $1 AND decommissioned_at IS NULL", [id]);
  await tx(async (c) => {
    await c.query("UPDATE machines SET name = $2, type = $3, site_id = $4, line_id = $5, notes = $6 WHERE id = $1", [id, b.name, b.type, b.siteId, b.lineId ?? null, b.notes]);
    if ((prevNode?.id ?? null) !== (b.nodeId ?? null)) {
      await c.query("UPDATE nodes SET machine_id = NULL WHERE machine_id = $1", [id]);
      if (b.nodeId) await c.query("UPDATE nodes SET machine_id = $2 WHERE id = $1", [b.nodeId, id]);
    }
  });
  await refreshMachineStatus(id);
  await audit(
    user,
    "machine.updated",
    b.name,
    diff({ name: m.name, type: m.type, siteId: m.site_id, lineId: m.line_id, notes: m.notes, nodeId: prevNode?.id ?? null }, { name: b.name, type: b.type, siteId: b.siteId, lineId: b.lineId ?? null, notes: b.notes, nodeId: b.nodeId ?? null }),
  );
  return NextResponse.json({ ok: true });
});

/** Archive: hidden from lists, history kept. The node is released. */
export const DELETE = route({ roles: ["admin"] }, async (_req, { user, params }) => {
  const id = intParam(params, "id");
  const m = await load(id);
  if (!m || m.archived_at) throw notFound("Machine not found");
  assertSite(user, m.site_id);
  await tx(async (c) => {
    await c.query("UPDATE machines SET archived_at = now() WHERE id = $1", [id]);
    await c.query("UPDATE nodes SET machine_id = NULL WHERE machine_id = $1", [id]);
  });
  await audit(user, "machine.archived", m.name);
  return NextResponse.json({ ok: true });
});
