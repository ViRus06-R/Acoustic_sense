import { NextResponse } from "next/server";
import { q } from "@/lib/server/db";
import { route, intParam, notFound, assertSite } from "@/lib/server/http";
import { getAlert } from "@/lib/server/alerts";

export const GET = route({}, async (_req, { user, params }) => {
  const a = await getAlert(intParam(params, "id"));
  if (!a) throw notFound("Alert not found");
  assertSite(user, a.siteId);
  // Score trace around the alert for the small chart.
  const trace = await q<{ t: Date; v: number }>(
    `SELECT event_time t, score v FROM telemetry
      WHERE node_id = $1 AND score IS NOT NULL
        AND event_time BETWEEN $2::timestamptz - interval '30 minutes' AND $3::timestamptz + interval '15 minutes'
      ORDER BY event_time LIMIT 400`,
    [a.nodeId, a.detectedAt, a.lastEventAt],
  );
  const history = await q(
    `SELECT at, user_name "userName", action, details FROM audit_log WHERE target = $1 ORDER BY at DESC LIMIT 20`,
    [a.code],
  );
  return NextResponse.json({ ...a, trace, history });
});
