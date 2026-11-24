import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/server/db";
import { route, param, notFound } from "@/lib/server/http";

export const GET = route({}, async (_req, { user, params }) => {
  const id = param(params, "id");
  const n = await q1<{ site_id: number }>("SELECT site_id FROM nodes WHERE id = $1", [id]);
  if (!n || !user.siteIds.includes(n.site_id)) throw notFound();
  const rows = await q(
    `SELECT id, received_at "receivedAt", events_synced "eventsSynced", outage_start "outageStart", outage_end "outageEnd",
            EXTRACT(EPOCH FROM (received_at - outage_start))::int "outageSec"
       FROM sync_history WHERE node_id = $1 ORDER BY received_at DESC LIMIT 50`,
    [id],
  );
  return NextResponse.json(rows);
});
