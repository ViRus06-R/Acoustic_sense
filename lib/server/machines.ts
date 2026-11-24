import { z } from "zod";
import { q1 } from "./db";
import { badRequest } from "./http";
import { MACHINE_TYPES } from "@/lib/shared/domain";

export const machineSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(60),
  type: z.enum(MACHINE_TYPES),
  siteId: z.number().int().positive(),
  lineId: z.number().int().positive().nullable().optional(),
  nodeId: z.string().regex(/^AS-N-\d{3}$/).nullable().optional(),
  notes: z.string().trim().max(500).default(""),
});

export async function validateMachine(b: z.infer<typeof machineSchema>, machineId: number | null) {
  const fields: Record<string, string> = {};
  if (await q1("SELECT 1 FROM machines WHERE site_id = $1 AND lower(name) = lower($2) AND archived_at IS NULL AND ($3::int IS NULL OR id <> $3)", [b.siteId, b.name, machineId])) {
    fields.name = "A machine with this name already exists at this site";
  }
  if (b.lineId && !(await q1("SELECT 1 FROM lines WHERE id = $1 AND site_id = $2 AND archived_at IS NULL", [b.lineId, b.siteId]))) fields.lineId = "Line does not belong to this site";
  if (b.nodeId) {
    const n = await q1<{ machine_id: number | null; site_id: number; decommissioned_at: Date | null }>("SELECT machine_id, site_id, decommissioned_at FROM nodes WHERE id = $1", [b.nodeId]);
    if (!n || n.decommissioned_at) fields.nodeId = "Unknown node";
    else if (n.machine_id && n.machine_id !== machineId) fields.nodeId = "This node is already assigned to another machine";
    else if (n.site_id !== b.siteId) fields.nodeId = "Node is registered at a different site";
  }
  if (Object.keys(fields).length) throw badRequest("Please fix the highlighted fields.", fields);
}

