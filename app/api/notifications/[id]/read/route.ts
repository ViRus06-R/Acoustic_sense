import { NextResponse } from "next/server";
import { q } from "@/lib/server/db";
import { route, intParam } from "@/lib/server/http";

export const POST = route({}, async (_req, { user, params }) => {
  // Scoped to the current user: you can only mark your own notifications.
  await q("UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2", [intParam(params, "id"), user.id]);
  return NextResponse.json({ ok: true });
});
