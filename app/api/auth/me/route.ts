import { NextResponse } from "next/server";
import { q } from "@/lib/server/db";
import { route } from "@/lib/server/http";

export const GET = route({}, async (_req, { user }) => {
  const sites = await q<{ id: number; name: string; timezone: string | null }>(
    "SELECT id, name, timezone FROM sites WHERE id = ANY($1) AND archived_at IS NULL ORDER BY name",
    [user.siteIds],
  );
  const lines = await q<{ id: number; site_id: number; name: string }>(
    "SELECT id, site_id, name FROM lines WHERE site_id = ANY($1) AND archived_at IS NULL ORDER BY name",
    [user.siteIds],
  );
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    notifyVia: user.notifyVia,
    lastLoginAt: user.lastLoginAt,
    sites: sites.map((s) => ({ ...s, lines: lines.filter((l) => l.site_id === s.id).map((l) => ({ id: l.id, name: l.name })) })),
  });
});
