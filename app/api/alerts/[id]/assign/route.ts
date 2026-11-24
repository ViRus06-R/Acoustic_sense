import { NextResponse } from "next/server";
import { z } from "zod";
import { q, q1 } from "@/lib/server/db";
import { route, intParam, body, badRequest } from "@/lib/server/http";
import { loadAlertForAction } from "@/lib/server/alert-actions";
import { audit } from "@/lib/server/audit";
import { publish } from "@/lib/server/realtime";
import { notifyUser } from "@/lib/server/notify";
import { fmtScore } from "@/lib/shared/format";

const schema = z.object({ userId: z.number().int().positive() });

export const POST = route({ roles: ["admin", "engineer"] }, async (req, { user, params }) => {
  const a = await loadAlertForAction(user, intParam(params, "id"));
  const { userId } = await body(req, schema);
  const assignee = await q1<{ id: number; name: string }>(
    `SELECT u.id, u.name FROM users u WHERE u.id = $1 AND u.status = 'active' AND u.role IN ('admin','engineer')
        AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM user_sites us WHERE us.user_id = u.id AND us.site_id = $2))`,
    [userId, a.site_id],
  );
  if (!assignee) throw badRequest("This user cannot be assigned to alerts at this site.", { userId: "Not eligible" });
  await q("UPDATE alerts SET assignee_id = $2 WHERE id = $1", [a.id, assignee.id]);
  await audit(user, "alert.assigned", a.code, { assignee: assignee.name });
  publish({ type: "alert", alertId: a.id, siteId: a.site_id, severity: a.severity, action: "updated" });
  const machine = a.machine_id ? await q1<{ name: string }>("SELECT name FROM machines WHERE id = $1", [a.machine_id]) : null;
  if (assignee.id !== user.id) {
    await notifyUser(assignee.id, {
      title: `Assigned to you: ${machine?.name ?? a.node_id} ${a.severity}`,
      body: a.severity === "Offline" ? `Node ${a.node_id} offline . by ${user.name}` : `Score ${fmtScore(a.score)} vs threshold ${fmtScore(a.threshold)} . by ${user.name}`,
      severity: a.severity,
      alertId: a.id,
      email: true,
    });
  }
  return NextResponse.json({ ok: true, assignee });
});
