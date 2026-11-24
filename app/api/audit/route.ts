import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { auditWhere } from "@/lib/server/audit-query";

export const GET = route({ roles: ["admin"] }, async (req) => {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 25));
  const w = auditWhere(req);
  const total = await q1<{ n: number }>(`SELECT count(*)::int n FROM audit_log WHERE ${w.sql}`, w.params as never[]);
  const items = await q(
    `SELECT id, at, user_name "userName", action, target, details FROM audit_log WHERE ${w.sql} ORDER BY at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    w.params as never[],
  );
  const users = await q<{ user_name: string }>("SELECT DISTINCT user_name FROM audit_log WHERE user_name IS NOT NULL ORDER BY 1 LIMIT 200");
  const actions = await q<{ a: string }>("SELECT DISTINCT split_part(action, '.', 1) a FROM audit_log ORDER BY 1");
  return NextResponse.json({ items, total: total!.n, page, pageSize, users: users.map((u) => u.user_name), actionGroups: actions.map((a) => a.a) });
});
