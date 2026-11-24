import { q } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { auditWhere } from "@/lib/server/audit-query";
import { audit } from "@/lib/server/audit";
import { getSetting } from "@/lib/server/settings";
import { toCsv, isoInTimeZone } from "@/lib/shared/csv";

export const GET = route({ roles: ["admin"] }, async (req, { user }) => {
  const w = auditWhere(req);
  const tz = (await getSetting("general")).timezone;
  const rows = await q<{ at: Date; user_name: string; action: string; target: string; details: unknown }>(
    `SELECT at, user_name, action, target, details FROM audit_log WHERE ${w.sql} ORDER BY at DESC LIMIT 100000`,
    w.params as never[],
  );
  await audit(user, "audit.exported", "audit-log.csv", { rows: rows.length });
  const csv = toCsv(
    ["Time", "User", "Action", "Target", "Details"],
    rows.map((r) => [isoInTimeZone(r.at, tz), r.user_name, r.action, r.target, r.details ? JSON.stringify(r.details) : ""]),
  );
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
});
