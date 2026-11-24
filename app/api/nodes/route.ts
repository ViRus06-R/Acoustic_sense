import { NextResponse } from "next/server";
import { z } from "zod";
import { q, q1 } from "@/lib/server/db";
import { route, body, assertSite, scopeSites, badRequest } from "@/lib/server/http";
import { generateMqttPassword, hashMqttPassword, listNodes, topicsFor } from "@/lib/server/nodes";
import { audit } from "@/lib/server/audit";
import { refreshMachineStatus } from "@/lib/server/ingest";
import { nextNodeId, NODE_ID_RE } from "@/lib/shared/domain";

export const GET = route({}, async (req, { user }) => {
  const sp = req.nextUrl.searchParams;
  const siteIds = scopeSites(user, sp.get("site"));
  const lineId = sp.get("line") ? Number(sp.get("line")) : null;
  const { rows, latest } = await listNodes(siteIds, lineId);
  const kpi = {
    total: rows.length,
    online: rows.filter((r) => r.status !== "Offline").length,
    offline: rows.filter((r) => r.status === "Offline").length,
    pending: rows.reduce((s, r) => s + (r.pending || 0), 0),
    outdated: rows.filter((r) => r.firmwareOutdated).length,
  };
  let items = rows;
  const status = sp.get("status");
  if (status && status !== "All") items = items.filter((r) => r.status === status);
  const fw = sp.get("firmware");
  if (fw && fw !== "All") items = items.filter((r) => r.firmware === fw);
  const text = (sp.get("q") ?? "").trim().toLowerCase();
  if (text) items = items.filter((r) => r.id.toLowerCase().includes(text) || (r.machine?.name.toLowerCase().includes(text) ?? false));
  const firmwares = [...new Set(rows.map((r) => r.firmware).filter(Boolean))].sort().reverse();
  const allIds = (await q<{ id: string }>("SELECT id FROM nodes")).map((r) => r.id);
  return NextResponse.json({ items, kpi, latestFirmware: latest, firmwares, nextId: nextNodeId(allIds) });
});

const schema = z.object({
  id: z.string().trim().regex(NODE_ID_RE, "Use the pattern AS-N-###"),
  siteId: z.number().int().positive(),
  lineId: z.number().int().positive().nullable().optional(),
  machineId: z.number().int().positive().nullable().optional(),
  mountingNote: z.string().trim().max(200).default(""),
});

export const POST = route({ roles: ["admin"] }, async (req, { user }) => {
  const b = await body(req, schema);
  assertSite(user, b.siteId);
  const fields: Record<string, string> = {};
  if (await q1("SELECT 1 FROM nodes WHERE id = $1", [b.id])) fields.id = "This node ID is already registered";
  if (b.lineId && !(await q1("SELECT 1 FROM lines WHERE id = $1 AND site_id = $2", [b.lineId, b.siteId]))) fields.lineId = "Line does not belong to this site";
  if (b.machineId) {
    const m = await q1<{ site_id: number }>("SELECT site_id FROM machines WHERE id = $1 AND archived_at IS NULL", [b.machineId]);
    if (!m || m.site_id !== b.siteId) fields.machineId = "Machine not found at this site";
    else if (await q1("SELECT 1 FROM nodes WHERE machine_id = $1 AND decommissioned_at IS NULL", [b.machineId])) fields.machineId = "This machine already has a node";
  }
  if (Object.keys(fields).length) throw badRequest("Please fix the highlighted fields.", fields);

  const password = generateMqttPassword();
  const site = await q1<{ slug: string }>("SELECT slug FROM sites WHERE id = $1", [b.siteId]);
  await q(
    "INSERT INTO nodes(id, site_id, line_id, machine_id, mounting_note, mqtt_password_hash, model) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [b.id, b.siteId, b.lineId ?? null, b.machineId ?? null, b.mountingNote, await hashMqttPassword(password), "AE-MFCC v3 . int8 . 58 KB"],
  );
  if (b.machineId) await refreshMachineStatus(b.machineId);
  await audit(user, "node.registered", b.id, { siteId: b.siteId, lineId: b.lineId, machineId: b.machineId });
  // The plain password is returned ONCE and never stored (only its bcrypt hash).
  return NextResponse.json({ id: b.id, credentials: { username: b.id, password }, topics: await topicsFor(site!.slug, b.id) }, { status: 201 });
});
