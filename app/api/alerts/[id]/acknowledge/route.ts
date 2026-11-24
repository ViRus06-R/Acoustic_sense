import { NextResponse } from "next/server";
import { q } from "@/lib/server/db";
import { route, intParam, badRequest } from "@/lib/server/http";
import { loadAlertForAction } from "@/lib/server/alert-actions";
import { audit } from "@/lib/server/audit";
import { publish } from "@/lib/server/realtime";

export const POST = route({ roles: ["admin", "engineer"] }, async (_req, { user, params }) => {
  const a = await loadAlertForAction(user, intParam(params, "id"));
  if (a.status !== "Open") throw badRequest("Only open alerts can be acknowledged.");
  await q("UPDATE alerts SET status = 'Acknowledged', acknowledged_by = $2, acknowledged_at = now() WHERE id = $1", [a.id, user.id]);
  await audit(user, "alert.acknowledged", a.code);
  publish({ type: "alert", alertId: a.id, siteId: a.site_id, severity: a.severity, action: "updated" });
  return NextResponse.json({ ok: true });
});
