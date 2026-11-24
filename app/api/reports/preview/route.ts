import { NextResponse } from "next/server";
import { route, body } from "@/lib/server/http";
import { buildReport, reportParamsSchema } from "@/lib/server/reports";
import { audit } from "@/lib/server/audit";

export const POST = route({}, async (req, { user }) => {
  const p = await body(req, reportParamsSchema);
  const r = await buildReport(user, p);
  const start = (p.page - 1) * p.pageSize;
  if (p.page === 1) await audit(user, "report.generated", r.title, { type: p.type, from: p.from, to: p.to, rows: r.rows.length });
  return NextResponse.json({
    ...r,
    rows: r.rows.slice(start, start + p.pageSize),
    page: p.page,
    pageSize: p.pageSize,
    total: r.rows.length,
    meta: { generatedAt: new Date().toISOString(), generatedBy: user.name, params: p },
  });
});
