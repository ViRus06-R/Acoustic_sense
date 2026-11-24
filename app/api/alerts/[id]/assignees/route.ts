import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/server/db";
import { route, intParam, notFound, assertSite } from "@/lib/server/http";

/** Maintenance Engineers and Admins with access to the alert's site. */
export const GET = route({ roles: ["admin", "engineer"] }, async (_req, { user, params }) => {
  const a = await q1<{ site_id: number }>("SELECT site_id FROM alerts WHERE id = $1", [intParam(params, "id")]);
  if (!a) throw notFound();
  assertSite(user, a.site_id);
  const rows = await q(
    `SELECT u.id, u.name, u.role FROM users u
      WHERE u.status = 'active' AND u.role IN ('admin','engineer')
        AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM user_sites us WHERE us.user_id = u.id AND us.site_id = $1))
      ORDER BY u.name`,
    [a.site_id],
  );
  return NextResponse.json(rows);
});
