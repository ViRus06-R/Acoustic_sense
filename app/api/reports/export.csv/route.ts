import { route, badRequest } from "@/lib/server/http";
import { buildReport, reportParamsSchema } from "@/lib/server/reports";
import { audit } from "@/lib/server/audit";
import { getSetting } from "@/lib/server/settings";
import { toCsv, isoInTimeZone } from "@/lib/shared/csv";

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export const GET = route({}, async (req, { user }) => {
  const sp = req.nextUrl.searchParams;
  const parsed = reportParamsSchema.safeParse({
    type: sp.get("type"),
    from: sp.get("from"),
    to: sp.get("to"),
    siteIds: list(sp.get("siteIds")).map(Number),
    lines: list(sp.get("lines")).map(Number),
    machineIds: list(sp.get("machineIds")).map(Number),
    severities: list(sp.get("severities")),
  });
  if (!parsed.success) throw badRequest("Invalid report parameters");
  const r = await buildReport(user, parsed.data);
  const tz = (await getSetting("general")).timezone;
  const csv = toCsv(
    r.columns.map((c) => c.label),
    r.rows.map((row) => r.columns.map((c) => (c.type === "datetime" ? isoInTimeZone(row[c.key] as Date, tz) : row[c.key]))),
  );
  await audit(user, "report.exported", r.title, { type: parsed.data.type, rows: r.rows.length });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${parsed.data.type}-report-${parsed.data.from.slice(0, 10)}-to-${parsed.data.to.slice(0, 10)}.csv"`,
    },
  });
});
