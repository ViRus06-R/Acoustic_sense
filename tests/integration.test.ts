/**
 * Integration tests against a private in-memory Postgres (PGlite) - does not touch the demo DB.
 * Covers: RBAC guards on real route handlers, ingestion de-duplication, offline-sync labelling,
 * notification read/unread logic, and the Offline monitor.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { NextRequest } from "next/server";

let db: PGlite;
let server: PGLiteSocketServer;
type Mod = Record<string, (...a: never[]) => unknown>;
let q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const cookies: Record<string, string> = {};

function req(method: string, url: string, who: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      cookie: `as_session=${cookies[who]}`,
      "x-requested-with": "acoustic-sense",
      "content-type": "application/json",
      host: "localhost",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

beforeAll(async () => {
  db = await PGlite.create();
  server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1", maxConnections: 8 });
  await server.start();
  const port = (server as unknown as { port: number }).port;
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.AS_DISABLE_BACKGROUND = "1";
  process.env.DB_POOL_MAX = "2";
  const dbm = await import("@/lib/server/db");
  await dbm.ensureSchema();
  q = dbm.q as never;
  await q("INSERT INTO sites(name, slug) VALUES ('Wah Plant','wah-plant'), ('Taxila','taxila')");
  await q("INSERT INTO machines(name, type, site_id, status) VALUES ('Pump P-101','Pump',1,'Normal'), ('Pump TX-P1','Pump',2,'Normal')");
  await q("INSERT INTO nodes(id, site_id, machine_id, threshold, last_heartbeat_at) VALUES ('AS-N-007',1,1,0.045, now()), ('AS-N-020',2,2,0.04, now() - interval '10 minutes')");
  const auth = await import("@/lib/server/auth");
  const users: [string, string, string, number[]][] = [
    ["Admin A", "admin@x", "admin", []],
    ["Eng E", "eng@x", "engineer", [1]],
    ["View V", "view@x", "viewer", [1]],
  ];
  for (const [name, email, role, sites] of users) {
    const r = await q("INSERT INTO users(name, email, role, password_hash) VALUES ($1,$2,$3,'x') RETURNING id", [name, email, role]);
    for (const s of sites) await q("INSERT INTO user_sites VALUES ($1,$2)", [r[0].id, s]);
    const s = await auth.createSession(r[0].id as number, false, new NextRequest("http://localhost/"));
    cookies[role] = s.token;
  }
});

afterAll(async () => {
  const dbm = await import("@/lib/server/db");
  await dbm.pool().end();
  await server?.stop();
  await db?.close();
});

describe("RBAC guards on real API handlers", () => {
  it("Settings API: 403 for engineer and viewer, 200 for admin", async () => {
    const { GET } = (await import("@/app/api/settings/route")) as unknown as { GET: (r: NextRequest, c: unknown) => Promise<Response> };
    expect((await GET(req("GET", "/api/settings", "viewer"), ctx())).status).toBe(403);
    expect((await GET(req("GET", "/api/settings", "engineer"), ctx())).status).toBe(403);
    expect((await GET(req("GET", "/api/settings", "admin"), ctx())).status).toBe(200);
  });
  it("Users API is admin-only", async () => {
    const { GET } = (await import("@/app/api/users/route")) as unknown as { GET: (r: NextRequest, c: unknown) => Promise<Response> };
    expect((await GET(req("GET", "/api/users", "engineer"), ctx())).status).toBe(403);
    expect((await GET(req("GET", "/api/users", "admin"), ctx())).status).toBe(200);
  });
  it("Viewer cannot create machines or acknowledge alerts; unauthenticated gets 401", async () => {
    const { POST } = (await import("@/app/api/machines/route")) as unknown as { POST: (r: NextRequest, c: unknown) => Promise<Response> };
    expect((await POST(req("POST", "/api/machines", "viewer", { name: "X", type: "Pump", siteId: 1 }), ctx())).status).toBe(403);
    const r = await POST(new NextRequest("http://localhost/api/machines", { method: "POST", headers: { "x-requested-with": "acoustic-sense" } }), ctx());
    expect(r.status).toBe(401);
  });
  it("blocks cross-site requests without the CSRF header", async () => {
    const { POST } = (await import("@/app/api/machines/route")) as unknown as { POST: (r: NextRequest, c: unknown) => Promise<Response> };
    const r = await POST(new NextRequest("http://localhost/api/machines", { method: "POST", headers: { cookie: `as_session=${cookies.admin}` }, body: "{}" }), ctx());
    expect(r.status).toBe(403);
  });
  it("users only see their sites", async () => {
    const { GET } = (await import("@/app/api/machines/route")) as unknown as { GET: (r: NextRequest, c: unknown) => Promise<Response> };
    const eng = await (await GET(req("GET", "/api/machines", "engineer"), ctx())).json();
    const adm = await (await GET(req("GET", "/api/machines", "admin"), ctx())).json();
    expect(eng.items.map((m: { name: string }) => m.name)).toEqual(["Pump P-101"]);
    expect(adm.items).toHaveLength(2);
    const detail = (await import("@/app/api/machines/[id]/route")) as unknown as { GET: (r: NextRequest, c: unknown) => Promise<Response> };
    expect((await detail.GET(req("GET", "/api/machines/2", "engineer"), ctx({ id: "2" }))).status).toBe(403);
  });
});

describe("MQTT ingestion", () => {
  it("ignores duplicate telemetry (same node_id + seq)", async () => {
    const { handleMessage } = (await import("@/lib/server/ingest")) as unknown as Mod & { handleMessage: (t: string, p: string) => Promise<{ ok: boolean; duplicate?: boolean }> };
    const msg = JSON.stringify({ node_id: "AS-N-007", seq: 1001, event_time: new Date().toISOString(), rssi: -61, infer_ms: 38, pending: 0, score: 0.02, fw: "v1.2.0" });
    expect(await handleMessage("acousticsense/wah-plant/AS-N-007/telemetry", msg)).toEqual({ ok: true });
    expect(await handleMessage("acousticsense/wah-plant/AS-N-007/telemetry", msg)).toEqual({ ok: true, duplicate: true });
    const rows = await q("SELECT count(*)::int n FROM telemetry WHERE node_id = 'AS-N-007' AND seq = 1001");
    expect(rows[0].n).toBe(1);
  });
  it("rejects a node publishing on another node's topic", async () => {
    const { handleMessage } = (await import("@/lib/server/ingest")) as unknown as { handleMessage: (t: string, p: string) => Promise<{ ok: boolean; reason?: string }> };
    const msg = JSON.stringify({ node_id: "AS-N-007", seq: 1, event_time: new Date().toISOString() });
    expect((await handleMessage("acousticsense/wah-plant/AS-N-020/telemetry", msg)).ok).toBe(false);
    expect((await handleMessage("acousticsense/taxila/AS-N-007/telemetry", msg)).ok).toBe(false);
  });
  it("creates one alert per episode, labels late messages as Offline log sync, records sync history", async () => {
    const { handleMessage } = (await import("@/lib/server/ingest")) as unknown as { handleMessage: (t: string, p: string) => Promise<{ ok: boolean; alertId?: number }> };
    const late = Date.now() - 5 * 60_000;
    const a1 = await handleMessage("acousticsense/wah-plant/AS-N-007/alert", JSON.stringify({ node_id: "AS-N-007", seq: 2001, event_time: new Date(late).toISOString(), anomaly_score: 0.06, threshold: 0.045, status: "warning" }));
    const a2 = await handleMessage("acousticsense/wah-plant/AS-N-007/alert", JSON.stringify({ node_id: "AS-N-007", seq: 2002, event_time: new Date(late + 10_000).toISOString(), anomaly_score: 0.071, threshold: 0.045, status: "anomaly" }));
    expect(a1.alertId).toBeDefined();
    expect(a2.alertId).toBe(a1.alertId); // de-duplicated into one alert, upgraded to Anomaly
    const [alert] = await q("SELECT severity, delivered_via, windows, score FROM alerts WHERE id = $1", [a1.alertId]);
    expect(alert).toMatchObject({ severity: "Anomaly", delivered_via: "Offline log sync", windows: 2, score: 0.071 });
    const sync = await q("SELECT events_synced FROM sync_history WHERE node_id = 'AS-N-007'");
    expect(sync[0].events_synced).toBe(2);
  });
});

describe("offline-log burst arriving all at once", () => {
  it("is processed in order per node: one alert, one sync-history row", async () => {
    const { handleMessage } = (await import("@/lib/server/ingest")) as unknown as { handleMessage: (t: string, p: string) => Promise<{ ok: boolean }> };
    await q("UPDATE nodes SET last_heartbeat_at = now() WHERE id = 'AS-N-020'");
    const start = Date.now() - 3 * 60_000;
    const msgs = Array.from({ length: 12 }, (_, i) => ({ node_id: "AS-N-020", seq: 5000 + i, event_time: new Date(start + i * 10_000).toISOString(), anomaly_score: 0.06, threshold: 0.04, status: i >= 9 ? "anomaly" : "warning" }));
    msgs.sort(() => Math.random() - 0.5); // out of order
    await Promise.all(msgs.map((m) => handleMessage("acousticsense/taxila/AS-N-020/alert", JSON.stringify(m))));
    const alerts = await q("SELECT severity, delivered_via, windows FROM alerts WHERE node_id = 'AS-N-020' AND severity <> 'Offline'");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ delivered_via: "Offline log sync", windows: 12, severity: "Anomaly" });
    const sync = await q("SELECT events_synced FROM sync_history WHERE node_id = 'AS-N-020'");
    expect(sync).toHaveLength(1);
    expect(sync[0].events_synced).toBe(12);
    await q("UPDATE nodes SET last_heartbeat_at = now() - interval '10 minutes' WHERE id = 'AS-N-020'");
  });
});

describe("notifications read / unread", () => {
  it("fan-out reaches users with site access; badge counts unread; read is per user", async () => {
    const list = (await import("@/app/api/notifications/route")) as unknown as { GET: (r: NextRequest, c: unknown) => Promise<Response> };
    const readOne = (await import("@/app/api/notifications/[id]/read/route")) as unknown as { POST: (r: NextRequest, c: unknown) => Promise<Response> };
    const readAll = (await import("@/app/api/notifications/read-all/route")) as unknown as { POST: (r: NextRequest, c: unknown) => Promise<Response> };
    const get = async (who: string) => (await (await list.GET(req("GET", "/api/notifications", who), ctx())).json()) as { unread: number; items: { id: number; read: boolean }[] };

    const eng = await get("engineer");
    const view = await get("viewer");
    expect(eng.unread).toBeGreaterThan(0); // from the alert created above (site 1)
    const before = view.unread;

    // Engineer marks one read: only their own count changes.
    await readOne.POST(req("POST", `/api/notifications/${eng.items[0].id}/read`, "engineer"), ctx({ id: String(eng.items[0].id) }));
    expect((await get("engineer")).unread).toBe(eng.unread - 1);
    expect((await get("viewer")).unread).toBe(before);

    // Viewer cannot mark the engineer's notification (scoped to the current user).
    const engId = (await get("engineer")).items.find((n) => !n.read)?.id;
    if (engId) await readOne.POST(req("POST", `/api/notifications/${engId}/read`, "viewer"), ctx({ id: String(engId) }));
    expect((await get("engineer")).unread).toBe(eng.unread - 1);

    await readAll.POST(req("POST", "/api/notifications/read-all", "engineer"), ctx());
    expect((await get("engineer")).unread).toBe(0);
    expect((await get("viewer")).unread).toBe(before);
  });
});

describe("offline monitor", () => {
  it("turns a node without heartbeat Offline and raises one Offline alert", async () => {
    const { runMonitorTick } = (await import("@/lib/server/ingest")) as unknown as { runMonitorTick: () => Promise<void> };
    await runMonitorTick();
    await runMonitorTick();
    const [m] = await q("SELECT status FROM machines WHERE id = 2");
    expect(m.status).toBe("Offline");
    const alerts = await q("SELECT count(*)::int n FROM alerts WHERE node_id = 'AS-N-020' AND severity = 'Offline'");
    expect(alerts[0].n).toBe(1);
  });
});
