import { NextResponse } from "next/server";
import { q1 } from "@/lib/server/db";
import { route, intParam, notFound } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";

export const POST = route({ roles: ["admin"] }, async (_req, { user, params }) => {
  const id = intParam(params, "id");
  const t = await q1<{ email: string }>("UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE id = $1 RETURNING email", [id]);
  if (!t) throw notFound("User not found");
  await audit(user, "user.unlocked", t.email);
  return NextResponse.json({ ok: true });
});
