// Shared domain types and pure rules used by both the server and the browser.
// The severity rule lives in ONE function: classifySeverity().

export type Role = "admin" | "engineer" | "viewer";
export type MachineStatus = "Normal" | "Warning" | "Anomaly" | "Offline";
export type AlertSeverity = "Warning" | "Anomaly" | "Offline";
export type AlertStatus = "Open" | "Acknowledged" | "Resolved";
export type NodeStatus = "Online" | "Offline" | "Degraded";
export type NotifyVia = "Push" | "Email" | "Push + email";
export type DeliveredVia = "MQTT live" | "Offline log sync";

export const MACHINE_TYPES = ["Pump", "Fan", "Motor", "Gearbox", "Compressor", "Conveyor"] as const;
export type MachineType = (typeof MACHINE_TYPES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  engineer: "Maintenance Engineer",
  viewer: "Viewer",
};
export const ROLE_CHIP: Record<Role, string> = { admin: "Admin", engineer: "Engineer", viewer: "Viewer" };

export interface DetectionConfig {
  persistenceWindows: number; // consecutive windows above threshold before Anomaly
  warningRatio: number; // Warning if latest score > warningRatio x threshold
  risingWindows: number; // Warning if score rose for N consecutive windows
  heartbeatTimeoutSec: number; // Offline if no heartbeat for this long
}

export const DEFAULT_DETECTION: DetectionConfig = {
  persistenceWindows: 9,
  warningRatio: 0.85,
  risingWindows: 5,
  heartbeatTimeoutSec: 120,
};

/**
 * THE severity rule. Used by the ingestion pipeline, the offline monitor and the tests.
 * - No heartbeat within the timeout -> Offline
 * - Score above threshold for `persistenceWindows` consecutive windows -> Anomaly
 * - Briefly above threshold, above warningRatio x threshold, or rising for `risingWindows` -> Warning
 * - Otherwise Normal
 * `scores` are ordered oldest -> newest.
 */
export function classifySeverity(input: {
  scores: number[];
  threshold: number;
  lastHeartbeatAt: Date | string | null;
  now?: Date;
  cfg: DetectionConfig;
}): MachineStatus {
  const now = input.now ?? new Date();
  const { scores, threshold, cfg } = input;
  if (!input.lastHeartbeatAt) return "Offline";
  const hb = new Date(input.lastHeartbeatAt).getTime();
  if (now.getTime() - hb > cfg.heartbeatTimeoutSec * 1000) return "Offline";
  if (scores.length === 0) return "Normal";

  let consecutiveAbove = 0;
  for (let i = scores.length - 1; i >= 0 && scores[i] > threshold; i--) consecutiveAbove++;
  if (consecutiveAbove >= cfg.persistenceWindows) return "Anomaly";
  if (consecutiveAbove > 0) return "Warning";

  const latest = scores[scores.length - 1];
  if (latest > threshold * cfg.warningRatio) return "Warning";

  if (cfg.risingWindows > 0 && scores.length > cfg.risingWindows) {
    let rising = true;
    for (let i = scores.length - cfg.risingWindows; i < scores.length; i++) {
      if (!(scores[i] > scores[i - 1])) {
        rising = false;
        break;
      }
    }
    if (rising && latest > threshold * 0.6) return "Warning";
  }
  return "Normal";
}

/** Order used for "Status severity" sorting: worst first. */
export const STATUS_RANK: Record<MachineStatus, number> = { Anomaly: 0, Warning: 1, Offline: 2, Normal: 3 };

export interface SortableMachine {
  name: string;
  status: MachineStatus;
  score: number | null;
  lastEventAt: string | null;
}
export type MachineSort = "severity" | "score" | "name" | "lastEvent";

export function sortMachines<T extends SortableMachine>(list: T[], sort: MachineSort): T[] {
  const copy = [...list];
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { numeric: true });
  copy.sort((a, b) => {
    switch (sort) {
      case "score":
        return (b.score ?? -1) - (a.score ?? -1) || byName(a, b);
      case "name":
        return byName(a, b);
      case "lastEvent":
        return (b.lastEventAt ? Date.parse(b.lastEventAt) : 0) - (a.lastEventAt ? Date.parse(a.lastEventAt) : 0) || byName(a, b);
      case "severity":
      default:
        return STATUS_RANK[a.status] - STATUS_RANK[b.status] || (b.score ?? -1) - (a.score ?? -1) || byName(a, b);
    }
  });
  return copy;
}

export function filterMachinesByStatus<T extends { status: MachineStatus }>(list: T[], status: string | null | undefined): T[] {
  if (!status || status === "All") return list;
  return list.filter((m) => m.status === status);
}

// ---- Nodes ----
export type RssiBucket = "excellent" | "good" | "fair" | "weak";
export function rssiBucket(rssi: number | null | undefined): RssiBucket {
  if (rssi == null) return "weak";
  if (rssi > -55) return "excellent";
  if (rssi >= -67) return "good";
  if (rssi >= -80) return "fair";
  return "weak";
}
export const RSSI_BARS: Record<RssiBucket, number> = { excellent: 4, good: 3, fair: 2, weak: 1 };

export function deriveNodeStatus(input: {
  lastHeartbeatAt: Date | string | null;
  rssi: number | null;
  pending: number;
  heartbeatTimeoutSec: number;
  now?: Date;
}): NodeStatus {
  const now = input.now ?? new Date();
  if (!input.lastHeartbeatAt) return "Offline";
  if (now.getTime() - new Date(input.lastHeartbeatAt).getTime() > input.heartbeatTimeoutSec * 1000) return "Offline";
  if (rssiBucket(input.rssi) === "weak" || input.pending > 0) return "Degraded";
  return "Online";
}

export function compareFirmware(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
export function latestFirmware(versions: string[]): string | null {
  const v = versions.filter(Boolean);
  if (!v.length) return null;
  return v.reduce((max, x) => (compareFirmware(x, max) > 0 ? x : max));
}

/** "Offline log sync" when the message reached the backend much later than it happened. */
export const OFFLINE_SYNC_LAG_MS = 30_000;
export function deliveredVia(eventTime: Date, receivedAt: Date): DeliveredVia {
  return receivedAt.getTime() - eventTime.getTime() > OFFLINE_SYNC_LAG_MS ? "Offline log sync" : "MQTT live";
}

export const NODE_ID_RE = /^AS-N-\d{3}$/;
export function nextNodeId(existing: string[]): string {
  let max = 0;
  for (const id of existing) {
    const m = /^AS-N-(\d{3})$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `AS-N-${String(max + 1).padStart(3, "0")}`;
}

/** Human alert number. Offset chosen so the seeded P-101 anomaly is #A-2311 as in the design. */
export function alertCode(id: number): string {
  return `A-${2180 + id}`;
}
