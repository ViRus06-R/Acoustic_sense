import { NextResponse } from "next/server";
import { q1 } from "@/lib/server/db";
import { route, intParam, notFound, badRequest } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { revokeSessions } from "@/lib/server/auth";
import { sendPasswordLink } from "@/lib/server/users";
import { publish } from "@/lib/server/realtime";

/** Sends a new one-time password link and revokes the user's sessions. */
export const POST = route({ roles: ["admin"] }, async (_req, { user, params }) => {
  const id = intParam(params, "id");
  const t = await q1<{ id: number; name: string; email: string; status: string; password_hash: string | null }>(
    "SELECT id, name, email, status, password_hash FROM users WHERE id = $1",
    [id],
  );
  if (!t) throw notFound("User not found");
  if (t.status !== "active") throw badRequest("Enable the user before sending a password link.");
  const mail = await sendPasswordLink(t, t.password_hash ? "reset" : "set");
  await revokeSessions(id);
  publish({ type: "session-revoked", userId: id });
  await audit(user, "user.password_link_sent", t.email);
  return NextResponse.json({ ok: true, devMail: `dev-mail/${mail.id}.eml` });
});
