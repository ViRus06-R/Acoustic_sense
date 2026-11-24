import { NextResponse } from "next/server";
import { z } from "zod";
import { q1, tx } from "@/lib/server/db";
import { route, param, body, notFound, assertSite, badRequest } from "@/lib/server/http";
import { loadNode } from "@/lib/server/nodes";
import { audit } from "@/lib/server/audit";
import { refreshMachineStatus } from "@/lib/server/ingest";

const schema = z.object({ machineId: z.number().int().positive().nullable() });

export const POST = route({ roles: ["admin"] }, async (req, { user, params }) => {
  const id = param(params, "id");
  const n = await loadNode(id);
  if (!n || n.decommissioned_at) throw notFound("Node not found");
  assertSite(user, n.site_id);
  const { machineId } = await body(req, schema);
  if (machineId) {
    const m = await q1<{ site_id: number; line_id: number | null }>("SELECT site_id, line_id FROM machines WHERE id = $1 AND archived_at IS NULL", [machineId]);
    if (!m || m.site_id !== n.site_id) throw badRequest("Machine not found at this node's site", { machineId: "Not at this site" });
    const other = await q1<{ id: string }>("SELECT id FROM nodes WHERE machine_id = $1 AND decommissioned_at IS NULL AND id <> $2", [machineId, id]);
    if (other) throw badRequest(`This machine already has node ${other.id}`, { machineId: `Already has node ${other.id}` });
  }
  await tx(async (c) => {
    await c.query("UPDATE nodes SET machine_id = $2 WHERE id = $1", [id, machineId]);
  });
  if (n.machine_id) await refreshMachineStatus(n.machine_id);
  if (machineId) await refreshMachineStatus(machineId);
  await audit(user, "node.reassigned", id, { from: n.machine_id, to: machineId });
  return NextResponse.json({ ok: true });
});
