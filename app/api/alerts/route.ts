import { NextResponse } from "next/server";
import { route } from "@/lib/server/http";
import { alertFiltersFrom, alertSummary, listAlerts } from "@/lib/server/alerts";

export const GET = route({}, async (req, { user }) => {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 25));
  const f = alertFiltersFrom(req, user);
  const { items, total } = await listAlerts(f, page, pageSize);
  const summary = await alertSummary(f.siteIds);
  return NextResponse.json({ items, total, page, pageSize, summary });
});
