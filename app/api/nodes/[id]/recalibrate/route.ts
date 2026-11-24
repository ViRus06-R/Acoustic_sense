import { NextResponse } from "next/server";
import { q1 } from "@/lib/server/db";
import { route, param, notFound, assertSite } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { publish } from "@/lib/server/realtime";

export const POST = route({ roles: ["admin", "engineer"] }, async (_req, { user, params }) => {
  const id = param(params, "id");
  const n = await q1<{ site_id: number }>("SELECT site_id FROM nodes WHERE id = $1 AND decommissioned_at IS NULL", [id]);
  if (!n) throw notFound("Node not found");
  assertSite(user, n.site_id);
  // This version only records the request. A later version would publish a config message
  // (e.g. {"cmd":"recalibrate"}) to acousticsense/{site}/{node}/config so the device re-learns
  // its threshold from a fresh baseline window.
  const r = await q1<{ at: Date }>("UPDATE nodes SET recalibration_requested_at = now() WHERE id = $1 RETURNING recalibration_requested_at at", [id]);
  await audit(user, "node.recalibration_requested", id);
  publish({ type: "node", nodeId: id, siteId: n.site_id });
  return NextResponse.json({ ok: true, requestedAt: r!.at });
});
