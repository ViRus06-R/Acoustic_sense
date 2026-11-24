import { NextResponse } from "next/server";
import { z } from "zod";
import { q } from "@/lib/server/db";
import { route, body } from "@/lib/server/http";
import { getSetting } from "@/lib/server/settings";
import { audit } from "@/lib/server/audit";

const schema = z.object({ confirm: z.literal("PURGE", { message: 'Type PURGE to confirm' }) });

export const POST = route({ roles: ["admin"] }, async (req, { user }) => {
  await body(req, schema);
  const days = (await getSetting("retention")).telemetryDays;
  const [r] = await q<{ n: number }>("WITH d AS (DELETE FROM telemetry WHERE event_time < now() - make_interval(days => $1) RETURNING 1) SELECT count(*)::int n FROM d", [days]);
  await audit(user, "settings.telemetry_purged", "telemetry", { olderThanDays: days, rows: r.n });
  return NextResponse.json({ ok: true, deleted: r.n });
});
