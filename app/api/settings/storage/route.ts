import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { getSetting } from "@/lib/server/settings";

export const GET = route({ roles: ["admin"] }, async () => {
  const days = (await getSetting("retention")).telemetryDays;
  const tables = ["telemetry", "alerts", "alert_messages", "audit_log", "notifications", "sync_history"];
  const out = [];
  for (const t of tables) {
    const r = await q1<{ n: number; bytes: number | null }>(`SELECT count(*)::int n, pg_total_relation_size('${t}')::bigint bytes FROM ${t}`);
    out.push({ table: t, rows: r!.n, mb: r!.bytes != null ? Math.round((r!.bytes / 1024 / 1024) * 10) / 10 : null });
  }
  const purgeable = await q<{ n: number }>("SELECT count(*)::int n FROM telemetry WHERE event_time < now() - make_interval(days => $1)", [days]);
  return NextResponse.json({ tables: out, purgeableTelemetry: purgeable[0].n, retentionDays: days });
});
