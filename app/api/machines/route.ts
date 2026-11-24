import { NextResponse } from "next/server";
import { tx } from "@/lib/server/db";
import { machineSchema, validateMachine } from "@/lib/server/machines";
import { route, body, assertSite, scopeSites } from "@/lib/server/http";
import { listMachines } from "@/lib/server/repo";
import { audit } from "@/lib/server/audit";
import { refreshMachineStatus } from "@/lib/server/ingest";
import { filterMachinesByStatus, MACHINE_TYPES, sortMachines, type MachineSort } from "@/lib/shared/domain";

const PAGE_SIZE = 24;

export const GET = route({}, async (req, { user }) => {
  const sp = req.nextUrl.searchParams;
  const siteIds = scopeSites(user, sp.get("site"));
  const lineId = sp.get("line") ? Number(sp.get("line")) : null;
  const type = sp.get("type") && (MACHINE_TYPES as readonly string[]).includes(sp.get("type")!) ? sp.get("type") : null;
  const qText = (sp.get("q") ?? "").trim().toLowerCase();
  const sort = (["severity", "score", "name", "lastEvent"].includes(sp.get("sort") ?? "") ? sp.get("sort") : "severity") as MachineSort;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize")) || PAGE_SIZE));

  let rows = await listMachines({ siteIds, lineId, type });
  const attention = rows.filter((m) => m.status !== "Normal").length;
  const all = rows.length;
  if (qText) rows = rows.filter((m) => m.name.toLowerCase().includes(qText) || (m.node?.id.toLowerCase().includes(qText) ?? false));
  rows = filterMachinesByStatus(rows, sp.get("status"));
  rows = sortMachines(rows, sort);
  return NextResponse.json({
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
    totals: { all, attention },
  });
});

export const POST = route({ roles: ["admin"] }, async (req, { user }) => {
  const b = await body(req, machineSchema);
  assertSite(user, b.siteId);
  await validateMachine(b, null);
  const id = await tx(async (c) => {
    const r = await c.query<{ id: number }>(
      "INSERT INTO machines(name, type, site_id, line_id, notes, status) VALUES ($1,$2,$3,$4,$5,'Offline') RETURNING id",
      [b.name, b.type, b.siteId, b.lineId ?? null, b.notes],
    );
    const id = r.rows[0].id;
    if (b.nodeId) await c.query("UPDATE nodes SET machine_id = $2, line_id = COALESCE($3, line_id) WHERE id = $1", [b.nodeId, id, b.lineId ?? null]);
    return id;
  });
  await refreshMachineStatus(id);
  await audit(user, "machine.created", b.name, { ...b });
  return NextResponse.json({ id }, { status: 201 });
});
