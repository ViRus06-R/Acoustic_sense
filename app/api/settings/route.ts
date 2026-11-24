import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { getSettings } from "@/lib/server/settings";

export const GET = route({ roles: ["admin"] }, async () => {
  const settings = await getSettings();
  const usingDefaults = await q1<{ n: number }>("SELECT count(*)::int n FROM nodes WHERE decommissioned_at IS NULL AND persistence IS NULL");
  const meta = await q<{ key: string; updated_at: Date; name: string | null }>(
    "SELECT s.key, s.updated_at, u.name FROM settings s LEFT JOIN users u ON u.id = s.updated_by",
  );
  return NextResponse.json({
    settings,
    nodesUsingDefaults: usingDefaults!.n,
    updated: Object.fromEntries(meta.map((m) => [m.key, { at: m.updated_at, by: m.name }])),
  });
});
