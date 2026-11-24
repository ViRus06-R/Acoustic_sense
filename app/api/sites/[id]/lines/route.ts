import { NextResponse } from "next/server";
import { z } from "zod";
import { q1 } from "@/lib/server/db";
import { route, body, intParam, notFound, badRequest } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";

const schema = z.object({ name: z.string().trim().min(1, "Required").max(60) });

export const POST = route({ roles: ["admin"] }, async (req, { user, params }) => {
  const siteId = intParam(params, "id");
  const { name } = await body(req, schema);
  const site = await q1<{ name: string }>("SELECT name FROM sites WHERE id = $1 AND archived_at IS NULL", [siteId]);
  if (!site) throw notFound();
  if (await q1("SELECT 1 FROM lines WHERE site_id = $1 AND lower(name) = lower($2) AND archived_at IS NULL", [siteId, name])) {
    throw badRequest("Line already exists", { name: "Already exists at this site" });
  }
  const r = await q1<{ id: number }>("INSERT INTO lines(site_id, name) VALUES ($1,$2) RETURNING id", [siteId, name]);
  await audit(user, "line.created", `${site.name} . ${name}`);
  return NextResponse.json({ id: r!.id }, { status: 201 });
});
