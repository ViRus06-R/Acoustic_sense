import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { q, q1 } from "./db";
import { getSetting } from "./settings";
import type { NotifyVia, Role } from "@/lib/shared/domain";

export const SESSION_COOKIE = "as_session";
const REMEMBER_DAYS = 30;

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  notifyVia: NotifyVia;
  siteIds: number[]; // effective site access (admins: all sites)
  sessionId: string;
  lastLoginAt: string | null;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}
let dummyHash: string | null = null;
export async function verifyPassword(pw: string, hash: string | null) {
  // Compare against a dummy hash when the user has none, to keep timing similar.
  if (!hash) {
    dummyHash ??= await bcrypt.hash("dummy-password-for-timing", 11);
    await bcrypt.compare(pw, dummyHash);
    return false;
  }
  return bcrypt.compare(pw, hash);
}

export function clientIp(req: NextRequest) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || "local";
}

export async function createSession(userId: number, remember: boolean, req: NextRequest) {
  const token = randomToken();
  const sec = await getSetting("security");
  const expires = remember
    ? new Date(Date.now() + REMEMBER_DAYS * 86400_000)
    : new Date(Date.now() + sec.sessionTimeoutMin * 60_000);
  await q(
    "INSERT INTO sessions(id, user_id, remember, user_agent, ip, expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
    [sha256(token), userId, remember, req.headers.get("user-agent")?.slice(0, 300) ?? null, clientIp(req), expires],
  );
  return { token, expires, remember };
}

export function sessionCookie(token: string, remember: boolean, expires: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { expires } : {}), // otherwise a browser-session cookie
  };
}

export async function getSessionUser(req: NextRequest): Promise<AuthUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = sha256(token);
  const row = await q1<{
    sid: string;
    remember: boolean;
    last_seen_at: Date;
    expires_at: Date;
    revoked_at: Date | null;
    uid: number;
    name: string;
    email: string;
    role: Role;
    phone: string | null;
    notify_via: NotifyVia;
    status: string;
    last_login_at: Date | null;
  }>(
    `SELECT s.id sid, s.remember, s.last_seen_at, s.expires_at, s.revoked_at,
            u.id uid, u.name, u.email, u.role, u.phone, u.notify_via, u.status, u.last_login_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
    [id],
  );
  if (!row || row.revoked_at || row.status !== "active") return null;
  const now = Date.now();
  if (row.expires_at.getTime() < now) return null;
  const sec = await getSetting("security");
  if (!row.remember && now - row.last_seen_at.getTime() > sec.sessionTimeoutMin * 60_000) return null;
  if (now - row.last_seen_at.getTime() > 60_000) {
    const newExpiry = row.remember ? row.expires_at : new Date(now + sec.sessionTimeoutMin * 60_000);
    await q("UPDATE sessions SET last_seen_at = now(), expires_at = $2 WHERE id = $1", [id, newExpiry]);
  }
  return {
    id: row.uid,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    notifyVia: row.notify_via,
    siteIds: await siteIdsFor(row.uid, row.role),
    sessionId: row.sid,
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
  };
}

export async function siteIdsFor(userId: number, role: Role): Promise<number[]> {
  if (role === "admin") return (await q<{ id: number }>("SELECT id FROM sites WHERE archived_at IS NULL ORDER BY id")).map((r) => r.id);
  return (await q<{ site_id: number }>("SELECT site_id FROM user_sites WHERE user_id = $1 ORDER BY site_id", [userId])).map((r) => r.site_id);
}

export async function revokeSessions(userId: number, exceptSessionId?: string) {
  await q("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND ($2::text IS NULL OR id <> $2)", [
    userId,
    exceptSessionId ?? null,
  ]);
}

// ---- One-time tokens (reset / set password) ----
export async function issueAuthToken(userId: number, purpose: "reset" | "set") {
  const sec = await getSetting("security");
  const raw = randomToken();
  // A newer link invalidates any older unused one.
  await q("UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
  await q("INSERT INTO auth_tokens(user_id, token_hash, purpose, expires_at) VALUES ($1,$2,$3,$4)", [
    userId,
    sha256(raw),
    purpose,
    new Date(Date.now() + sec.linkExpiryHours * 3600_000),
  ]);
  return raw;
}

export type TokenCheck =
  | { ok: true; tokenId: number; userId: number; name: string; email: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

export async function checkAuthToken(raw: string, purpose: "reset" | "set", now = new Date()): Promise<TokenCheck> {
  if (!raw || raw.length > 200) return { ok: false, reason: "invalid" };
  const row = await q1<{ id: number; user_id: number; purpose: string; expires_at: Date; used_at: Date | null; name: string; email: string; status: string }>(
    "SELECT t.id, t.user_id, t.purpose, t.expires_at, t.used_at, u.name, u.email, u.status FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1",
    [sha256(raw)],
  );
  return evaluateToken(row, purpose, now);
}

/** Pure token decision, unit-tested. */
export function evaluateToken(
  row: { id: number; user_id: number; purpose: string; expires_at: Date; used_at: Date | null; name: string; email: string; status?: string } | null,
  purpose: string,
  now: Date,
): TokenCheck {
  if (!row || row.purpose !== purpose || row.status === "disabled") return { ok: false, reason: "invalid" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (row.expires_at.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, tokenId: row.id, userId: row.user_id, name: row.name, email: row.email };
}

export async function consumeAuthToken(tokenId: number): Promise<boolean> {
  const r = await q("UPDATE auth_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id", [tokenId]);
  return r.length === 1;
}
