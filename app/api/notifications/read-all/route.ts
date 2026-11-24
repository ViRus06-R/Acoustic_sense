import { NextResponse } from "next/server";
import { q } from "@/lib/server/db";
import { route } from "@/lib/server/http";

export const POST = route({}, async (_req, { user }) => {
  await q("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [user.id]);
  return NextResponse.json({ ok: true });
});
