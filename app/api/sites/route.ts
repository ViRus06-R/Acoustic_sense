import { NextResponse } from "next/server";
import { z } from "zod";
import { q, q1 } from "@/lib/server/db";
import { route, body, badRequest } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { slugify } from "@/lib/shared/format";

export const GET = route({}, async (req, { user }) => {
  const includeArchived = req.nextUrl.searchParams.get("archived") === "1" && user.role === "admin";
  const sites = await q<{ id: number; name: string; slug: string; address: string; timezone: string | null; archived_at: Date | null }>(
    `SELECT id, name, slug, address, timezone, archived_at FROM sites
      WHERE ($1 OR archived_at IS NULL) AND ($2 OR id = ANY($3)) ORDER BY name`,
    [includeArchived, user.role === "admin", user.siteIds],
  );
  const lines = await q<{ id: number; site_id: number; name: string; archived_at: Date | null; machines: number }>(
    `SELECT l.id, l.site_id, l.name, l.archived_at,
            (SELECT count(*)::int FROM machines m WHERE m.line_id = l.id AND m.archived_at IS NULL) machines
       FROM lines l WHERE ($1 OR l.archived_at IS NULL) ORDER BY l.name`,
    [includeArchived],
  );
  const counts = await q<{ site_id: number; n: number; names: string[] }>(
    "SELECT site_id, count(*)::int n, array_agg(name ORDER BY name) names FROM machines WHERE archived_at IS NULL GROUP BY site_id",
  );
  return NextResponse.json(
    sites.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      address: s.address,
      timezone: s.timezone,
      archived: !!s.archived_at,
      activeMachines: counts.find((c) => c.site_id === s.id)?.n ?? 0,
      activeMachineNames: counts.find((c) => c.site_id === s.id)?.names ?? [],
      lines: lines.filter((l) => l.site_id === s.id).map((l) => ({ id: l.id, name: l.name, archived: !!l.archived_at, machines: l.machines })),
    })),
  );
});

const createSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(80),
  address: z.string().trim().max(200).default(""),
  timezone: z.string().trim().max(60).nullable().optional(),
});

export const POST = route({ roles: ["admin"] }, async (req, { user }) => {
  const b = await body(req, createSchema);
  const slug = slugify(b.name);
  if (!slug) throw badRequest("Invalid name", { name: "Use letters or digits" });
  if (await q1("SELECT 1 FROM sites WHERE slug = $1", [slug])) throw badRequest("A site with this name already exists.", { name: "Already exists" });
  const r = await q1<{ id: number }>("INSERT INTO sites(name, slug, address, timezone) VALUES ($1,$2,$3,$4) RETURNING id", [b.name, slug, b.address, b.timezone ?? null]);
  await audit(user, "site.created", b.name, { slug });
  return NextResponse.json({ id: r!.id }, { status: 201 });
});
