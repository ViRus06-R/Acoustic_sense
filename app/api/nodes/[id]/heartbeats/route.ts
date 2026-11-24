import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/server/db";
import { route, param, notFound } from "@/lib/server/http";
import { rangeSpec } from "@/lib/server/repo";

/** Uptime timeline: one bucket per slot, online when at least one heartbeat arrived in it. */
export const GET = route({}, async (req, { user, params }) => {
  const id = param(params, "id");
  const n = await q1<{ site_id: number }>("SELECT site_id FROM nodes WHERE id = $1", [id]);
  if (!n || !user.siteIds.includes(n.site_id)) throw notFound();
  const r = rangeSpec(req.nextUrl.searchParams.get("range"));
  const bucketSec = r.bucketSec;
  const rows = await q<{ t: Date; n: number }>(
    `WITH b AS (
       SELECT generate_series(to_timestamp(floor(extract(epoch FROM now() - $3::interval) / $2) * $2), now(), make_interval(secs => $2)) t
     )
     SELECT b.t, count(x.id)::int n FROM b
       LEFT JOIN telemetry x ON x.node_id = $1 AND x.event_time >= b.t AND x.event_time < b.t + make_interval(secs => $2)
      GROUP BY b.t ORDER BY b.t`,
    [id, bucketSec, r.interval],
  );
  const points = rows.map((x) => ({ t: x.t, online: x.n > 0, n: x.n }));
  const uptime = points.length ? Math.round((points.filter((p) => p.online).length / points.length) * 1000) / 10 : 0;
  return NextResponse.json({ points, bucketSec, uptime });
});
