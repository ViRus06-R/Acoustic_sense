import { NextResponse } from "next/server";
import { z } from "zod";
import { q } from "@/lib/server/db";
import { publicRoute, body, badRequest } from "@/lib/server/http";
import { checkAuthToken, consumeAuthToken, hashPassword, revokeSessions } from "@/lib/server/auth";
import { getSetting } from "@/lib/server/settings";
import { checkPasswordPolicy } from "@/lib/shared/password";
import { audit } from "@/lib/server/audit";

const schema = z.object({ token: z.string().max(200), purpose: z.enum(["reset", "set"]), password: z.string().max(200) });

export const POST = publicRoute(async (req) => {
  const { token, purpose, password } = await body(req, schema);
  const t = await checkAuthToken(token, purpose);
  if (!t.ok) {
    return NextResponse.json({ error: t.reason === "expired" ? "This link has expired." : "This link is invalid or has already been used.", reason: t.reason }, { status: 410 });
  }
  const sec = await getSetting("security");
  const policy = checkPasswordPolicy(password, sec);
  if (!policy.ok) throw badRequest("Password does not meet the policy.", { password: policy.rules.find((r) => !r.ok)!.label });
  if (!(await consumeAuthToken(t.tokenId))) {
    return NextResponse.json({ error: "This link is invalid or has already been used.", reason: "used" }, { status: 410 });
  }
  await q("UPDATE users SET password_hash = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1", [t.userId, await hashPassword(password)]);
  await revokeSessions(t.userId);
  await audit({ id: t.userId, name: t.name }, purpose === "set" ? "auth.password_set" : "auth.password_reset", t.email);
  return NextResponse.json({ ok: true });
});
