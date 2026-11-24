import type { MachineStatus, NodeStatus } from "@/lib/shared/domain";

export interface MachineItem {
  id: number;
  name: string;
  type: string;
  notes: string;
  site: { id: number; name: string };
  line: { id: number; name: string } | null;
  node: { id: string; status: NodeStatus; lastHeartbeatAt: string | null } | null;
  status: MachineStatus;
  score: number | null;
  threshold: number | null;
  lastEventAt: string | null;
  sparkline: number[];
}

export interface AlertItem {
  id: number;
  code: string;
  severity: "Warning" | "Anomaly" | "Offline";
  status: "Open" | "Acknowledged" | "Resolved";
  score: number | null;
  threshold: number | null;
  windows: number;
  detectedAt: string;
  lastEventAt: string;
  receivedAt: string;
  deliveredVia: string;
  nodeId: string;
  machineId: number | null;
  machine: string | null;
  site: string;
  line: string | null;
  siteId: number;
  durationSec: number;
  assigneeId: number | null;
  assignee: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  actionTaken: string | null;
  notes: string | null;
  downtimeMin: number | null;
  partsUsed: string | null;
  recalibrateAfterFix: boolean;
}

export interface NodeItem {
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

export interface SiteItem {
  id: number;
  name: string;
  slug: string;
  address: string;
  timezone: string | null;
  archived: boolean;
  activeMachines: number;
  activeMachineNames: string[];
  lines: { id: number; name: string; archived: boolean; machines: number }[];
}
