import mqtt, { type MqttClient } from "mqtt";
import { getSetting } from "./settings";
import { brokerState, countMessage, setBrokerStatus } from "./realtime";
import { handleMessage } from "./ingest";

type G = typeof globalThis & { __asMqtt?: { client: MqttClient | null; attempt: number; timer: NodeJS.Timeout | null; stopped: boolean } };
const g = globalThis as G;

function state() {
  g.__asMqtt ??= { client: null, attempt: 0, timer: null, stopped: false };
  return g.__asMqtt;
}

function brokerUrl(host: string, port: number, tls: boolean) {
  return `${tls ? "mqtts" : "mqtt"}://${host}:${port}`;
}

/** Backend MQTT consumer with exponential reconnect backoff (1 s .. 30 s). */
export async function startMqtt() {
  const s = state();
  if (s.client) return;
  s.stopped = false;
  const b = await getSetting("broker");
  const bs = brokerState();
  bs.host = b.host;
  bs.port = b.port;
  const client = mqtt.connect(brokerUrl(b.host, b.port, b.tls), {
    clientId: `acoustic-sense-backend-${process.pid}-${Math.random().toString(16).slice(2, 6)}`,
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 0, // we schedule reconnects ourselves (backoff)
    connectTimeout: 5000,
    clean: true,
  });
  s.client = client;
  if (s.attempt > 0) setBrokerStatus("reconnecting");

  client.on("connect", () => {
    s.attempt = 0;
    setBrokerStatus("connected", "");
    client.subscribe(`${b.topicPrefix}/+/+/alert`, { qos: b.qosAlerts });
    client.subscribe(`${b.topicPrefix}/+/+/telemetry`, { qos: b.qosTelemetry });
    console.log(`[mqtt] connected to ${b.host}:${b.port}`);
  });
  client.on("message", (topic, payload) => {
    countMessage();
    handleMessage(topic, payload).catch((e) => console.error("[mqtt] ingest error", (e as Error).message));
  });
  client.on("error", (e) => {
    brokerState().lastError = e.message;
  });
  client.on("close", () => {
    if (s.client !== client) return;
    s.client = null;
    client.removeAllListeners();
    client.end(true);
    if (s.stopped) {
      setBrokerStatus("disconnected");
      return;
    }
    s.attempt++;
    setBrokerStatus(s.attempt > 3 ? "disconnected" : "reconnecting");
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(s.attempt - 1, 5));
    s.timer = setTimeout(() => {
      s.timer = null;
      startMqtt().catch(() => {});
    }, delay);
  });
}

/** Reconnect with fresh settings (called after the Admin changes host/port). No server restart needed. */
export async function restartMqtt() {
  const s = state();
  s.stopped = true;
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  const c = s.client;
  s.client = null;
  if (c) {
    c.removeAllListeners();
    await new Promise<void>((r) => c.end(true, {}, () => r()));
  }
  s.attempt = 0;
  setBrokerStatus("reconnecting");
  await startMqtt();
}

/** Actually opens a connection to the broker and reports the result. */
export function testBrokerConnection(host: string, port: number, tls: boolean): Promise<{ ok: boolean; ms: number; error?: string }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const c = mqtt.connect(brokerUrl(host, port, tls), {
      clientId: `acoustic-sense-test-${Math.random().toString(16).slice(2, 8)}`,
      username: process.env.MQTT_USERNAME || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
      reconnectPeriod: 0,
      connectTimeout: 4000,
    });
    const done = (ok: boolean, error?: string) => {
      c.removeAllListeners();
      c.end(true);
      resolve({ ok, ms: Date.now() - started, error });
    };
    c.once("connect", () => done(true));
    c.once("error", (e) => done(false, e.message));
    c.once("close", () => done(false, "Connection closed"));
    setTimeout(() => done(false, "Timed out after 4 s"), 4500);
  });
}
