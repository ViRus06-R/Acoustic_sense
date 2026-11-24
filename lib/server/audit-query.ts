import type { NextRequest } from "next/server";

export function auditWhere(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const params: unknown[] = [];
  const w: string[] = ["true"];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    w.push(sql.replaceAll("?", `$${params.length}`));
  };
  const text = sp.get("q")?.trim();
  if (text) add("(user_name ILIKE ? OR target ILIKE ? OR action ILIKE ?)", `%${text.replace(/[%_\\]/g, "")}%`);
  const action = sp.get("action");
  if (action && action !== "All") add("action LIKE ?", `${action.replace(/[%_\\]/g, "")}.%`);
  const user = sp.get("user");
  if (user && user !== "All") add("user_name = ?", user);
  const days = Number(sp.get("days"));
  if (days > 0) add("at > now() - make_interval(days => ?)", Math.min(days, 3650));
  return { sql: w.join(" AND "), params };
}
