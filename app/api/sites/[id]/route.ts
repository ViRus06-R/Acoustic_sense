import { NextResponse } from "next/server";
import { z } from "zod";
import { q, q1 } from "@/lib/server/db";
import { route, body, intParam, notFound, badRequest } from "@/lib/server/http";
import { audit, diff } from "@/lib/server/audit";

const schema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(80).optional(),
  address: z.string().trim().max(200).optional(),
  timezone: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .optional()
    .refine((tz) => {
      if (!tz) return true;
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
  archived: z.boolean().optional(),
});

export const PATCH = route({ roles: ["admin"] }, async (req, { user, params }) => {
  const id = intParam(params, "id");
  const b = await body(req, schema);
  const site = await q1<{ name: string; address: string; timezone: string | null; archived_at: Date | null }>("SELECT name, address, timezone, archived_at FROM sites WHERE id = $1", [id]);
  if (!site) throw notFound();
  if (b.archived === true) {
    const active = await q<{ name: string }>("SELECT name FROM machines WHERE site_id = $1 AND archived_at IS NULL ORDER BY name", [id]);
    if (active.length) {
      throw badRequest(`Cannot archive: ${active.length} active machine(s) - ${active.slice(0, 6).map((m) => m.name).join(", ")}${active.length > 6 ? ", ..." : ""}`);
    }
  }
  if (b.name && b.name.toLowerCase() !== site.name.toLowerCase()) {
    if (await q1("SELECT 1 FROM sites WHERE lower(name) = lower($1) AND id <> $2", [b.name, id])) throw badRequest("Name already used", { name: "Already exists" });
  }
  await q(
    `UPDATE sites SET name = COALESCE($2, name), address = COALESCE($3, address),
            timezone = CASE WHEN $4::boolean THEN $5 ELSE timezone END,
            archived_at = CASE WHEN $6::boolean IS NULL THEN archived_at WHEN $6 THEN now() ELSE NULL END
      WHERE id = $1`,
    [id, b.name ?? null, b.address ?? null, b.timezone !== undefined, b.timezone || null, b.archived ?? null],
  );
  await audit(user, b.archived === true ? "site.archived" : "site.updated", site.name, diff({ name: site.name, address: site.address, timezone: site.timezone }, { name: b.name ?? site.name, address: b.address ?? site.address, timezone: b.timezone !== undefined ? b.timezone || null : site.timezone }));
  return NextResponse.json({ ok: true });
});
