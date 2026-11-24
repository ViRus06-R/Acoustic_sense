import { NextResponse } from "next/server";
import { z } from "zod";
import { q, q1 } from "@/lib/server/db";
import { route, body, badRequest } from "@/lib/server/http";
import { hashPassword, revokeSessions, verifyPassword } from "@/lib/server/auth";
import { getSetting } from "@/lib/server/settings";
import { checkPasswordPolicy } from "@/lib/shared/password";
import { audit } from "@/lib/server/audit";

const schema = z.object({ current: z.string().max(200), password: z.string().max(200) });

export const POST = route({}, async (req, { user }) => {
  const { current, password } = await body(req, schema);
  const row = await q1<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = $1", [user.id]);
  if (!(await verifyPassword(current, row?.password_hash ?? null))) throw badRequest("Current password is incorrect.", { current: "Current password is incorrect" });
  const policy = checkPasswordPolicy(password, await getSetting("security"));
  if (!policy.ok) throw badRequest("Password does not meet the policy.", { password: policy.rules.find((r) => !r.ok)!.label });
  if (current === password) throw badRequest("Choose a different password.", { password: "Must differ from the current password" });
  await q("UPDATE users SET password_hash = $2 WHERE id = $1", [user.id, await hashPassword(password)]);
  await revokeSessions(user.id, user.sessionId);
  await audit({ id: user.id, name: user.name }, "auth.password_changed", user.email);
  return NextResponse.json({ ok: true });
});
