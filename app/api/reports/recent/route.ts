import { NextResponse } from "next/server";
import { z } from "zod";
import { q } from "@/lib/server/db";
import { route, body } from "@/lib/server/http";
import { reportParamsSchema } from "@/lib/server/reports";

export const GET = route({}, async (_req, { user }) => {
  const rows = await q(
    `SELECT id, type, params, row_count "rowCount", created_at "createdAt" FROM report_runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [user.id],
  );
  return NextResponse.json(rows);
});

const schema = z.object({ params: reportParamsSchema, rowCount: z.number().int().min(0) });

export const POST = route({}, async (req, { user }) => {
  const b = await body(req, schema);
  const { page: _p, pageSize: _ps, ...params } = b.params;
  void _p;
  void _ps;
  await q("INSERT INTO report_runs(user_id, type, params, row_count) VALUES ($1,$2,$3,$4)", [user.id, params.type, JSON.stringify(params), b.rowCount]);
  await q("DELETE FROM report_runs WHERE user_id = $1 AND id NOT IN (SELECT id FROM report_runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20)", [user.id]);
  return NextResponse.json({ ok: true }, { status: 201 });
});
