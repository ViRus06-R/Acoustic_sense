import { NextResponse } from "next/server";
import { q1 } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { brokerState, messagesPerMinute } from "@/lib/server/realtime";
import { getSettings } from "@/lib/server/settings";

export const GET = route({ roles: ["admin"] }, async () => {
  const s = await getSettings();
  const b = brokerState();
  const nodes = await q1<{ n: number }>(
    "SELECT count(*)::int n FROM nodes WHERE decommissioned_at IS NULL AND last_heartbeat_at > now() - make_interval(secs => $1)",
    [s.detection.heartbeatTimeoutSec],
  );
  return NextResponse.json({
    status: b.status,
    uptimeSec: b.status === "connected" ? Math.round((Date.now() - b.since) / 1000) : 0,
    since: b.since,
    connectedNodes: nodes!.n,
    messagesPerMin: messagesPerMinute(),
    lastError: b.lastError,
    host: s.broker.host,
    port: s.broker.port,
    tls: s.broker.tls,
  });
});
