import { NextResponse } from "next/server";
import { q } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";

/** Signs out every user except the admin performing the action. */
export const POST = route({ roles: ["admin"] }, async (_req, { user }) => {
  const r = await q("UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL AND id <> $1 RETURNING id", [user.sessionId]);
  await audit(user, "settings.force_signout_all", "All users", { sessions: r.length });
  return NextResponse.json({ ok: true, revoked: r.length });
});
