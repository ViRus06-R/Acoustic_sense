import { NextResponse } from "next/server";
import { z } from "zod";
import { q } from "@/lib/server/db";
import { route, intParam, body } from "@/lib/server/http";
import { loadAlertForAction } from "@/lib/server/alert-actions";
import { audit } from "@/lib/server/audit";
import { publish } from "@/lib/server/realtime";

const schema = z.object({
  actionTaken: z.string().trim().min(1, "Action taken is required").max(120),
  notes: z.string().trim().max(2000).default(""),
  downtimeMin: z.number().int().min(0, "Cannot be negative").max(100000).nullable().optional(),
  partsUsed: z.string().trim().max(300).default(""),
  recalibrate: z.boolean().default(false),
});

export const POST = route({ roles: ["admin", "engineer"] }, async (req, { user, params }) => {
  const a = await loadAlertForAction(user, intParam(params, "id"));
  const b = await body(req, schema);
  await q(
    `UPDATE alerts SET status = 'Resolved', resolved_by = $2, resolved_at = now(),
            acknowledged_by = COALESCE(acknowledged_by, $2), acknowledged_at = COALESCE(acknowledged_at, now()),
            action_taken = $3, notes = $4, downtime_min = $5, parts_used = $6, recalibrate_after_fix = $7
      WHERE id = $1`,
    [a.id, user.id, b.actionTaken, b.notes, b.downtimeMin ?? null, b.partsUsed, b.recalibrate],
  );
  if (b.recalibrate) {
    // Request flag only; see nodes/[id]/recalibrate for the note about MQTT config messages.
    await q("UPDATE nodes SET recalibration_requested_at = now() WHERE id = $1", [a.node_id]);
    await audit(user, "node.recalibration_requested", a.node_id, { via: a.code });
  }
  await audit(user, "alert.resolved", a.code, { ...b });
  publish({ type: "alert", alertId: a.id, siteId: a.site_id, severity: a.severity, action: "updated" });
  return NextResponse.json({ ok: true });
});
