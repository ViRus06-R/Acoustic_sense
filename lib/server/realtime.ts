import { EventEmitter } from "node:events";

// In-process real-time bus. Ingestion publishes here; /api/stream relays to browsers over SSE.
export type RealtimeEvent =
  | { type: "machine"; machineId: number; siteId: number; status: string; score: number | null }
  | { type: "node"; nodeId: string; siteId: number }
  | { type: "alert"; alertId: number; siteId: number; severity: string; action: "created" | "updated" }
  | { type: "notification"; userId: number; title: string; body: string; severity: string; alertId: number | null }
  | { type: "broker"; status: BrokerState["status"] }
  | { type: "session-revoked"; userId: number };

export interface BrokerState {
  status: "connected" | "reconnecting" | "disconnected";
  since: number;
  messages: number[]; // timestamps of recent messages (for msgs/min)
  host: string;
  port: number;
  lastError: string | null;
}

type G = typeof globalThis & { __asBus?: EventEmitter; __asBroker?: BrokerState };
const g = globalThis as G;

export function bus(): EventEmitter {
  if (!g.__asBus) {
    g.__asBus = new EventEmitter();
    g.__asBus.setMaxListeners(500);
  }
  return g.__asBus;
}

export function publish(ev: RealtimeEvent) {
  bus().emit("event", ev);
}

export function brokerState(): BrokerState {
  if (!g.__asBroker) {
    g.__asBroker = { status: "disconnected", since: Date.now(), messages: [], host: "", port: 0, lastError: null };
  }
  return g.__asBroker;
}

export function setBrokerStatus(status: BrokerState["status"], err?: string) {
  const s = brokerState();
  if (s.status !== status) {
    s.status = status;
    s.since = Date.now();
    publish({ type: "broker", status });
  }
  if (err !== undefined) s.lastError = err;
}

export function countMessage() {
  const s = brokerState();
  const now = Date.now();
  s.messages.push(now);
  if (s.messages.length > 5000) s.messages = s.messages.filter((t) => now - t < 60_000);
}

export function messagesPerMinute(): number {
  const now = Date.now();
  return brokerState().messages.filter((t) => now - t < 60_000).length;
}
