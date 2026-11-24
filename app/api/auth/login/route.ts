import { NextResponse } from "next/server";
import { z } from "zod";
import { q, q1 } from "@/lib/server/db";
import { publicRoute, body } from "@/lib/server/http";
import { clientIp, createSession, sessionCookie, verifyPassword } from "@/lib/server/auth";
import { getSetting } from "@/lib/server/settings";
import { audit } from "@/lib/server/audit";

const schema = z.object({ email: z.string().trim().max(254), password: z.string().max(200), remember: z.boolean().optional() });

// Attempt counters for unknown emails, so responses do not reveal whether an account exists.
type G = typeof globalThis & { __asGhostAttempts?: Map<string, { n: number; until: number }> };
const g = globalThis as G;
const ghosts = () => (g.__asGhostAttempts ??= new Map());

export const POST = publicRoute(async (req) => {
  const { email, password, remember } = await body(req, schema);
  const sec = await getSetting("security");
  const generic = (left: number) =>
    NextResponse.json({ error: "Invalid email or password.", attemptsLeft: left }, { status: 401 });
  const locked = (until: number) =>
    NextResponse.json({ error: "Account locked.", lockedUntil: new Date(until).toISOString() }, { status: 423 });

  const user = await q1<{ id: number; name: string; password_hash: string | null; status: string; failed_attempts: number; locked_until: Date | null }>(
    "SELECT id, name, password_hash, status, failed_attempts, locked_until FROM users WHERE lower(email) = lower($1)",
    [email],
  );

  if (!user) {
    await verifyPassword(password, null);
    const key = email.toLowerCase();
    const gh = ghosts().get(key) ?? { n: 0, until: 0 };
    if (gh.until > Date.now()) return locked(gh.until);
    gh.n++;
    if (gh.n >= sec.lockoutAttempts) {
      gh.n = 0;
      gh.until = Date.now() + sec.lockoutMinutes * 60_000;
      ghosts().set(key, gh);
      return locked(gh.until);
    }
    ghosts().set(key, gh);
    await audit(null, "auth.login_failed", email, { ip: clientIp(req) });
    return generic(sec.lockoutAttempts - gh.n);
  }

  if (user.locked_until && user.locked_until.getTime() > Date.now()) return locked(user.locked_until.getTime());

  const ok = (await verifyPassword(password, user.password_hash)) && user.status === "active";
  if (!ok) {
    const attempts = user.failed_attempts + 1;
    if (attempts >= sec.lockoutAttempts) {
      const until = new Date(Date.now() + sec.lockoutMinutes * 60_000);
      await q("UPDATE users SET failed_attempts = 0, locked_until = $2 WHERE id = $1", [user.id, until]);
      await audit({ id: user.id, name: user.name }, "auth.locked", email, { ip: clientIp(req), minutes: sec.lockoutMinutes });
      return locked(until.getTime());
    }
    await q("UPDATE users SET failed_attempts = $2 WHERE id = $1", [user.id, attempts]);
    await audit({ id: user.id, name: user.name }, "auth.login_failed", email, { ip: clientIp(req), attempts });
    return generic(sec.lockoutAttempts - attempts);
  }

  await q("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1", [user.id]);
  const s = await createSession(user.id, !!remember, req);
  await audit({ id: user.id, name: user.name }, "auth.login", email, { ip: clientIp(req), remember: !!remember });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(s.token, s.remember, s.expires));
  return res;
});
