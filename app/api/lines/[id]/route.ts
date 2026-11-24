import { NextResponse } from "next/server";
import { z } from "zod";
import { q, q1 } from "@/lib/server/db";
import { route, body, intParam, notFound, badRequest } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";

const schema = z.object({ name: z.string().trim().min(1, "Required").max(60).optional(), archived: z.boolean().optional() });

export const PATCH = route({ roles: ["admin"] }, async (req, { user, params }) => {
  const id = intParam(params, "id");
  const b = await body(req, schema);
  const line = await q1<{ name: string; site_id: number; site: string }>("SELECT l.name, l.site_id, s.name site FROM lines l JOIN sites s ON s.id = l.site_id WHERE l.id = $1", [id]);
  if (!line) throw notFound();
  if (b.archived) {
    const active = await q<{ name: string }>("SELECT name FROM machines WHERE line_id = $1 AND archived_at IS NULL ORDER BY name", [id]);
    if (active.length) throw badRequest(`Cannot archive: active machines on this line - ${active.map((m) => m.name).join(", ")}`);
  }
  if (b.name && (await q1("SELECT 1 FROM lines WHERE site_id = $1 AND lower(name) = lower($2) AND id <> $3 AND archived_at IS NULL", [line.site_id, b.name, id]))) {
    throw badRequest("Line already exists", { name: "Already exists at this site" });
  }
  await q(
    "UPDATE lines SET name = COALESCE($2, name), archived_at = CASE WHEN $3::boolean IS NULL THEN archived_at WHEN $3 THEN now() ELSE NULL END WHERE id = $1",
    [id, b.name ?? null, b.archived ?? null],
  );
  await audit(user, b.archived ? "line.archived" : "line.renamed", `${line.site} . ${line.name}`, b.name ? { name: { old: line.name, new: b.name } } : undefined);
  return NextResponse.json({ ok: true });
});
