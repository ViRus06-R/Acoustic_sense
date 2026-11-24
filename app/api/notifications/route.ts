import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/server/db";
import { route } from "@/lib/server/http";

export const GET = route({}, async (req, { user }) => {
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 10));
  const items = await q(
    `SELECT id, alert_id "alertId", severity, title, body, created_at "createdAt", (read_at IS NOT NULL) read
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [user.id, limit],
  );
  const unread = await q1<{ n: number }>("SELECT count(*)::int n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [user.id]);
  return NextResponse.json({ items, unread: unread!.n });
});
