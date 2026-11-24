import { NextResponse } from "next/server";
import { q1 } from "@/lib/server/db";
import { route, intParam, notFound, assertSite } from "@/lib/server/http";
import { scoreSeries } from "@/lib/server/repo";

export const GET = route({}, async (req, { user, params }) => {
  const id = intParam(params, "id");
  const m = await q1<{ site_id: number; node_id: string | null; threshold: number | null }>(
    "SELECT m.site_id, n.id node_id, n.threshold FROM machines m LEFT JOIN nodes n ON n.machine_id = m.id AND n.decommissioned_at IS NULL WHERE m.id = $1",
    [id],
  );
  if (!m) throw notFound();
  assertSite(user, m.site_id);
  const points = m.node_id ? await scoreSeries([m.node_id], req.nextUrl.searchParams.get("range")) : [];
  return NextResponse.json({ threshold: m.threshold, points });
});
