import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/server/db";
import { route, param, notFound } from "@/lib/server/http";
import { rangeSpec } from "@/lib/server/repo";

export const GET = route({}, async (req, { user, params }) => {
  const id = param(params, "id");
  const n = await q1<{ site_id: number }>("SELECT site_id FROM nodes WHERE id = $1", [id]);
  if (!n || !user.siteIds.includes(n.site_id)) throw notFound();
  const r = rangeSpec(req.nextUrl.searchParams.get("range"));
  const points = await q(
    `SELECT to_timestamp(floor(extract(epoch FROM event_time) / $2) * $2) t, round(avg(rssi))::int v, min(rssi) min
       FROM telemetry WHERE node_id = $1 AND rssi IS NOT NULL AND event_time > now() - $3::interval
      GROUP BY 1 ORDER BY 1`,
    [id, r.bucketSec, r.interval],
  );
  return NextResponse.json({ points });
});
