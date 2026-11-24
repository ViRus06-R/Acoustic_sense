import { pbkdf2Sync, randomBytes } from "node:crypto";
import { q, q1 } from "./db";
import { getSetting } from "./settings";
import { deriveNodeStatus, latestFirmware, compareFirmware, type NodeStatus } from "@/lib/shared/domain";

export interface NodeListRow {
  id: string;
  machine: { id: number; name: string } | null;
  site: { id: number; name: string; slug: string };
  line: { id: number; name: string } | null;
  status: NodeStatus;
  lastHeartbeatAt: string | null;
  firmware: string | null;
  firmwareOutdated: boolean;
  model: string | null;
  rssi: number | null;
  inferenceMs: number | null;
  pending: number;
  threshold: number;
  mountingNote: string;
}

export async function listNodes(siteIds: number[], lineId?: number | null): Promise<{ rows: NodeListRow[]; latest: string | null }> {
  if (!siteIds.length) return { rows: [], latest: null };
  const det = await getSetting("detection");
  const rows = await q<{
    id: string;
    machine_id: number | null;
    machine_name: string | null;
    site_id: number;
    site_name: string;
    slug: string;
    line_id: number | null;
    line_name: string | null;
    last_heartbeat_at: Date | null;
    firmware: string | null;
    model: string | null;
    rssi: number | null;
    inference_ms: number | null;
    pending: number;
    threshold: number;
    mounting_note: string;
  }>(
    `SELECT n.id, n.machine_id, m.name machine_name, n.site_id, s.name site_name, s.slug, COALESCE(m.line_id, n.line_id) line_id, l.name line_name,
            n.last_heartbeat_at, n.firmware, n.model, n.rssi, n.inference_ms, n.pending, n.threshold, n.mounting_note
       FROM nodes n JOIN sites s ON s.id = n.site_id
       LEFT JOIN machines m ON m.id = n.machine_id
       LEFT JOIN lines l ON l.id = COALESCE(m.line_id, n.line_id)
      WHERE n.decommissioned_at IS NULL AND n.site_id = ANY($1) AND ($2::int IS NULL OR COALESCE(m.line_id, n.line_id) = $2)
      ORDER BY n.id`,
    [siteIds, lineId ?? null],
  );
  const latest = latestFirmware(rows.map((r) => r.firmware ?? ""));
  return {
    latest,
    rows: rows.map((r) => ({
      id: r.id,
      machine: r.machine_id ? { id: r.machine_id, name: r.machine_name! } : null,
      site: { id: r.site_id, name: r.site_name, slug: r.slug },
      line: r.line_id ? { id: r.line_id, name: r.line_name! } : null,
      status: deriveNodeStatus({ lastHeartbeatAt: r.last_heartbeat_at, rssi: r.rssi, pending: r.pending, heartbeatTimeoutSec: det.heartbeatTimeoutSec }),
      lastHeartbeatAt: r.last_heartbeat_at?.toISOString() ?? null,
      firmware: r.firmware,
      firmwareOutdated: !!(latest && r.firmware && compareFirmware(r.firmware, latest) < 0),
      model: r.model,
      rssi: r.rssi,
      inferenceMs: r.inference_ms,
      pending: r.pending,
      threshold: r.threshold,
      mountingNote: r.mounting_note,
    })),
  };
}

export async function loadNode(id: string) {
  return q1<{
    id: string;
    site_id: number;
    slug: string;
    site_name: string;
    line_id: number | null;
    machine_id: number | null;
    decommissioned_at: Date | null;
    threshold: number;
    persistence: number | null;
    heartbeat_interval: number;
  }>(
    "SELECT n.id, n.site_id, s.slug, s.name site_name, n.line_id, n.machine_id, n.decommissioned_at, n.threshold, n.persistence, n.heartbeat_interval FROM nodes n JOIN sites s ON s.id = n.site_id WHERE n.id = $1",
    [id],
  );
}

export function generateMqttPassword() {
  return randomBytes(18).toString("base64url");
}

/**
 * Mosquitto-compatible password hash ($7$ = PBKDF2-SHA512, as written by mosquitto_passwd).
 * Only this hash is stored; scripts/sync-broker-users.ts copies it into the broker password file.
 */
export async function hashMqttPassword(pw: string, salt = randomBytes(12), iterations = 101) {
  const hash = pbkdf2Sync(pw, salt, iterations, 64, "sha512");
  return `$7$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function topicsFor(siteSlug: string, nodeId: string) {
  const prefix = (await getSetting("broker")).topicPrefix;
  return { alert: `${prefix}/${siteSlug}/${nodeId}/alert`, telemetry: `${prefix}/${siteSlug}/${nodeId}/telemetry` };
}
