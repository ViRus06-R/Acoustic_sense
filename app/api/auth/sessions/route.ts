import { NextResponse } from "next/server";
import { q } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { revokeSessions } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";

export const GET = route({}, async (_req, { user }) => {
  const rows = await q<{ id: string; user_agent: string | null; ip: string | null; created_at: Date; last_seen_at: Date; remember: boolean }>(
    `SELECT id, user_agent, ip, created_at, last_seen_at, remember FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_seen_at DESC LIMIT 20`,
    [user.id],
  );
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id.slice(0, 8),
      current: r.id === user.sessionId,
      userAgent: r.user_agent,
      ip: r.ip,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      remember: r.remember,
    })),
  );
});

/** Sign out other sessions. */
export const DELETE = route({}, async (_req, { user }) => {
  await revokeSessions(user.id, user.sessionId);
  await audit({ id: user.id, name: user.name }, "auth.other_sessions_revoked", user.email);
  return NextResponse.json({ ok: true });
});
