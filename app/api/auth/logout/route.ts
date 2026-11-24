import { NextResponse } from "next/server";
import { q } from "@/lib/server/db";
import { publicRoute } from "@/lib/server/http";
import { SESSION_COOKIE, getSessionUser, sha256 } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";

export const POST = publicRoute(async (req) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await getSessionUser(req);
    await q("UPDATE sessions SET revoked_at = now() WHERE id = $1", [sha256(token)]);
    if (user) await audit({ id: user.id, name: user.name }, "auth.logout", user.email);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
});
