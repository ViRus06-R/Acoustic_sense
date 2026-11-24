import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { brokerState, messagesPerMinute } from "@/lib/server/realtime";
import { getSetting } from "@/lib/server/settings";

export const GET = route({}, async (_req, { user }) => {
  const det = await getSetting("detection");
  const online = await q1<{ n: number }>(
    `SELECT count(*)::int n FROM nodes WHERE decommissioned_at IS NULL AND site_id = ANY($1)
        AND last_heartbeat_at > now() - make_interval(secs => $2)`,
    [user.siteIds, det.heartbeatTimeoutSec],
  );
  const openAlerts = await q<{ n: number }>(
    "SELECT count(*)::int n FROM alerts WHERE status = 'Open' AND site_id = ANY($1)",
    [user.siteIds],
  );
  const b = brokerState();
  return NextResponse.json({
    broker: { status: b.status, since: b.since, host: b.host, port: b.port, messagesPerMin: messagesPerMinute() },
    nodesOnline: online?.n ?? 0,
    openAlerts: openAlerts[0]?.n ?? 0,
  });
});
