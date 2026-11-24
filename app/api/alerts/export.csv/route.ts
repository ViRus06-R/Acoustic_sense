import { route } from "@/lib/server/http";
import { alertFiltersFrom, iterateAlerts } from "@/lib/server/alerts";
import { audit } from "@/lib/server/audit";
import { getSetting } from "@/lib/server/settings";
import { BOM, csvRow, isoInTimeZone } from "@/lib/shared/csv";

const HEADER = ["Alert", "Detected at", "Machine", "Node", "Site", "Line", "Severity", "Score", "Threshold", "Duration (s)", "Delivered via", "Status", "Assignee", "Acknowledged at", "Resolved at", "Resolved by", "Action taken", "Downtime (min)", "Parts used", "Notes"];

export const GET = route({ roles: ["admin", "engineer"] }, async (req, { user }) => {
  const f = alertFiltersFrom(req, user);
  if (req.nextUrl.searchParams.get("range") === null) f.days = null;
  const tz = (await getSetting("general")).timezone;
  const it = await iterateAlerts(f);
  await audit(user, "alerts.exported", "alerts.csv", { filters: Object.fromEntries(req.nextUrl.searchParams) });
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      c.enqueue(enc.encode(BOM + csvRow(HEADER)));
      for await (const a of it) {
        c.enqueue(
          enc.encode(
            csvRow([a.code, isoInTimeZone(a.detectedAt, tz), a.machine, a.nodeId, a.site, a.line, a.severity, a.score, a.threshold, a.durationSec, a.deliveredVia, a.status, a.assignee, isoInTimeZone(a.acknowledgedAt, tz), isoInTimeZone(a.resolvedAt, tz), a.resolvedBy, a.actionTaken, a.downtimeMin, a.partsUsed, a.notes]),
          ),
        );
      }
      c.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="alerts-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
});
