/**
 * Demo seed.  npm run seed            -> idempotent: upserts sites, machines, nodes, users;
 *                                        generates 30 days of history only if none exists.
 *             npm run seed -- --reset -> also wipes and regenerates history (alerts, telemetry, ...).
 * Reads the fleet from scripts/fleet.json (shared with the simulator).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import bcrypt from "bcryptjs";
import { SCHEMA_SQL } from "../lib/server/schema.sql";
import { classifySeverity, DEFAULT_DETECTION } from "../lib/shared/domain";

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "AcousticDemo#2026";

interface FleetNode {
  id: string;
  machine: string;
  type: string;
  site: string;
  line: string | null;
  threshold: number;
  baseline: number;
  rssi: number;
  fw: string;
  pending: number;
  mount: string;
  role: string;
}
const fleet = JSON.parse(readFileSync(path.join(__dirname, "fleet.json"), "utf8")) as {
  sites: { name: string; slug: string; address: string; lines: string[] }[];
  nodes: FleetNode[];
};

// Deterministic PRNG so every reset produces the same demo.
let seedState = 20261124;
function rand() {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];
const between = (a: number, b: number) => a + rand() * (b - a);

const USERS = [
  { name: "Hamza Ranjha", email: "hamza.ranjha@acousticsense.local", role: "admin", sites: ["wah-plant", "taxila-pumping-station"], notify: "Push + email", status: "active" },
  { name: "Faaiz Khan", email: "faaiz.khan@acousticsense.local", role: "engineer", sites: ["wah-plant"], notify: "Push + email", status: "active" },
  { name: "Ayesha Tariq", email: "ayesha.tariq@acousticsense.local", role: "engineer", sites: ["wah-plant", "taxila-pumping-station"], notify: "Email", status: "active" },
  { name: "Usman Ali", email: "usman.ali@acousticsense.local", role: "viewer", sites: ["wah-plant"], notify: "Push", status: "active" },
  { name: "Bilal Ahmed", email: "bilal.ahmed@acousticsense.local", role: "engineer", sites: ["taxila-pumping-station"], notify: "Email", status: "disabled" },
];

const ACTIONS: [string, string][] = [
  ["Bearing lubricated", "Grease (SKF LGMT 2), 40 g"],
  ["Fan blade rebalanced", "Balance weights x2"],
  ["Belt replaced", "V-belt A42"],
  ["Coupling realigned", ""],
  ["Mounting bolts retightened", ""],
  ["Impeller cleaned", ""],
  ["Bearing replaced", "Bearing 6205-2RS"],
  ["Air filter replaced", "Air filter element"],
  ["No fault found", ""],
];

async function main() {
  const reset = process.argv.includes("--reset");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres", max: 1 });
  const c = await pool.connect();
  try {
    console.log("[seed] applying schema");
    await c.query(SCHEMA_SQL);
    const ids = await upsertReference(c);
    const hasHistory = (await c.query("SELECT 1 FROM telemetry LIMIT 1")).rowCount;
    if (reset || !hasHistory) {
      await generateHistory(c, ids);
    } else {
      console.log("[seed] history already present - skipped (use `npm run seed -- --reset` to regenerate)");
    }
    console.log(`\n[seed] done. Demo password for all accounts: ${DEMO_PASSWORD}  (DEMO ONLY)`);
    for (const u of USERS) console.log(`        ${u.role.padEnd(8)} ${u.email}${u.status === "disabled" ? "  (disabled)" : ""}`);
  } finally {
    c.release();
    await pool.end();
  }
}

async function upsertReference(c: PoolClient) {
  const siteIds = new Map<string, number>();
  const lineIds = new Map<string, number>();
  for (const s of fleet.sites) {
    const r = await c.query<{ id: number }>(
      `INSERT INTO sites(name, slug, address, timezone) VALUES ($1,$2,$3,'Asia/Karachi')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address, archived_at = NULL RETURNING id`,
      [s.name, s.slug, s.address],
    );
    siteIds.set(s.slug, r.rows[0].id);
    for (const l of s.lines) {
      const ex = await c.query<{ id: number }>("SELECT id FROM lines WHERE site_id = $1 AND lower(name) = lower($2) AND archived_at IS NULL", [r.rows[0].id, l]);
      const id = ex.rows[0]?.id ?? (await c.query<{ id: number }>("INSERT INTO lines(site_id, name) VALUES ($1,$2) RETURNING id", [r.rows[0].id, l])).rows[0].id;
      lineIds.set(`${s.slug}/${l}`, id);
    }
  }
  const machineIds = new Map<string, number>();
  for (const n of fleet.nodes) {
    const siteId = siteIds.get(n.site)!;
    const lineId = n.line ? lineIds.get(`${n.site}/${n.line}`)! : null;
    const ex = await c.query<{ id: number }>("SELECT id FROM machines WHERE site_id = $1 AND lower(name) = lower($2) AND archived_at IS NULL", [siteId, n.machine]);
    let mid = ex.rows[0]?.id;
    if (mid) await c.query("UPDATE machines SET type = $2, line_id = $3 WHERE id = $1", [mid, n.type, lineId]);
    else mid = (await c.query<{ id: number }>("INSERT INTO machines(name, type, site_id, line_id, status) VALUES ($1,$2,$3,$4,'Offline') RETURNING id", [n.machine, n.type, siteId, lineId])).rows[0].id;
    machineIds.set(n.id, mid);
  }
  const devHash = null; // seeded nodes have no device credentials; use "Rotate credentials" on the Node page to issue them
  for (const n of fleet.nodes) {
    const siteId = siteIds.get(n.site)!;
    const lineId = n.line ? lineIds.get(`${n.site}/${n.line}`)! : null;
    await c.query("UPDATE nodes SET machine_id = NULL WHERE machine_id = $1 AND id <> $2", [machineIds.get(n.id), n.id]);
    await c.query(
      `INSERT INTO nodes(id, site_id, line_id, machine_id, mounting_note, firmware, model, threshold, rssi, pending, inference_ms, mqtt_password_hash, registered_at)
       VALUES ($1,$2,$3,$4,$5,$6,'AE-MFCC v3 . int8 . 58 KB',$7,$8,$9,38,$10, now() - interval '45 days')
       ON CONFLICT (id) DO UPDATE SET site_id = EXCLUDED.site_id, line_id = EXCLUDED.line_id, machine_id = EXCLUDED.machine_id,
         mounting_note = EXCLUDED.mounting_note, firmware = EXCLUDED.firmware, model = EXCLUDED.model, threshold = EXCLUDED.threshold,
         rssi = EXCLUDED.rssi, pending = EXCLUDED.pending, decommissioned_at = NULL`,
      [n.id, siteId, lineId, machineIds.get(n.id), n.mount, n.fw, n.threshold, n.rssi, n.pending, devHash],
    );
  }
  const hash = await bcrypt.hash(DEMO_PASSWORD, 11);
  const userIds = new Map<string, number>();
  for (const u of USERS) {
    const r = await c.query<{ id: number }>(
      `INSERT INTO users(name, email, password_hash, role, notify_via, status, last_login_at) VALUES ($1,$2,$3,$4,$5,$6, now() - interval '1 day')
       ON CONFLICT ((lower(email))) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role,
         notify_via = EXCLUDED.notify_via, status = EXCLUDED.status, failed_attempts = 0, locked_until = NULL RETURNING id`,
      [u.name, u.email, hash, u.role, u.notify, u.status],
    );
    userIds.set(u.name, r.rows[0].id);
    await c.query("DELETE FROM user_sites WHERE user_id = $1", [r.rows[0].id]);
    for (const s of u.sites) await c.query("INSERT INTO user_sites(user_id, site_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [r.rows[0].id, siteIds.get(s)]);
  }
  console.log(`[seed] ${fleet.sites.length} sites, ${fleet.nodes.length} machines/nodes, ${USERS.length} users upserted`);
  return { siteIds, machineIds, userIds };
}

type Ids = Awaited<ReturnType<typeof upsertReference>>;

async function generateHistory(c: PoolClient, ids: Ids) {
  console.log("[seed] generating 30 days of history (this takes a minute)...");
  await c.query("TRUNCATE notifications, alert_messages, sync_history, report_runs, audit_log, telemetry RESTART IDENTITY");
  await c.query("TRUNCATE alerts RESTART IDENTITY CASCADE");
  const now = Date.now();
  const nodeById = new Map(fleet.nodes.map((n) => [n.id, n]));

  // 1) Telemetry every 5 minutes for 30 days (aggregated in SQL).
  for (const n of fleet.nodes) {
    const endOffsetMin = n.role === "offline" ? 125 : 0;
    await c.query(
      `INSERT INTO telemetry(node_id, event_time, received_at, rssi, infer_ms, pending, score, fw, status)
       SELECT $1, t, t, $2 + floor(random() * 7 - 3)::int, round((36 + random() * 5)::numeric, 1)::float, 0,
              round(($3 * (0.82 + random() * 0.3))::numeric, 5)::float, $4, 'ok'
         FROM generate_series(date_trunc('minute', now()) - interval '30 days', date_trunc('minute', now()) - make_interval(mins => $5), interval '5 minutes') t`,
      [n.id, n.rssi, n.baseline, n.fw, endOffsetMin],
    );
  }

  // 2) Historic alerts (127), chronological, then the 4 current ones -> P-101 is the newest (#A-2311).
  const userIds = ids.userIds;
  const resolvers = ["Faaiz Khan", "Ayesha Tariq", "Hamza Ranjha"];
  const historic: { node: FleetNode; sev: string; at: number; durMin: number }[] = [];
  const weighted = fleet.nodes.flatMap((n) => (["warning", "anomaly"].includes(n.role) ? [n, n, n] : [n]));
  for (let i = 0; i < 127; i++) {
    const node = pick(weighted);
    const r = rand();
    const sev = r < 0.55 ? "Warning" : r < 0.87 ? "Anomaly" : "Offline";
    const at = now - between(1.2, 29.5) * 86400_000;
    historic.push({ node, sev, at, durMin: sev === "Offline" ? between(15, 90) : between(2, 45) });
  }
  historic.sort((a, b) => a.at - b.at);

  for (const h of historic) {
    const det = new Date(h.at);
    const last = new Date(h.at + h.durMin * 60_000);
    const thr = h.node.threshold;
    const score = h.sev === "Offline" ? null : Math.round(thr * (h.sev === "Anomaly" ? between(1.25, 1.8) : between(1.02, 1.2)) * 1000) / 1000;
    const offlineSync = h.sev !== "Offline" && rand() < 0.1;
    const ackMin = between(2, 75);
    const resMin = ackMin + between(20, 1800);
    const resolver = pick(resolvers);
    const acked = new Date(h.at + ackMin * 60_000);
    const resolved = new Date(h.at + resMin * 60_000);
    const [action, parts] = h.sev === "Offline" ? ["Auto-resolved: heartbeat restored", ""] : pick(ACTIONS);
    const auto = h.sev === "Offline";
    const r = await c.query<{ id: number }>(
      `INSERT INTO alerts(node_id, machine_id, site_id, severity, score, threshold, windows, detected_at, last_event_at, received_at, delivered_via, status,
                          acknowledged_by, acknowledged_at, resolved_by, resolved_at, action_taken, notes, downtime_min, parts_used)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Resolved',$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [
        h.node.id,
        ids.machineIds.get(h.node.id),
        ids.siteIds.get(h.node.site),
        h.sev,
        score,
        h.sev === "Offline" ? null : thr,
        Math.max(1, Math.round((h.durMin * 60) / 10)),
        det,
        last,
        offlineSync ? new Date(last.getTime() + between(5, 60) * 60_000) : det,
        offlineSync ? "Offline log sync" : "MQTT live",
        auto ? null : userIds.get(resolver),
        auto ? null : acked,
        auto ? null : userIds.get(resolver),
        auto ? last : resolved,
        action,
        auto ? null : pick(["", "", "Vibration noticeably reduced after work.", "Checked with handheld analyser, OK.", "Scheduled follow-up next shift."]),
        auto ? null : Math.round(between(0, 120)),
        parts,
      ],
    );
    if (h.sev === "Offline") {
      await c.query("DELETE FROM telemetry WHERE node_id = $1 AND event_time BETWEEN $2 AND $3", [h.node.id, det, last]);
      await c.query("INSERT INTO sync_history(node_id, received_at, events_synced, outage_start, outage_end) VALUES ($1,$2,$3,$4,$5)", [
        h.node.id,
        new Date(last.getTime() + 30_000),
        Math.round(between(1, 9)),
        new Date(det.getTime() - 120_000),
        last,
      ]);
    } else {
      await c.query("UPDATE telemetry SET score = round(($4 * (1.02 + random() * 0.4))::numeric, 5)::float WHERE node_id = $1 AND event_time BETWEEN $2 AND $3", [
        h.node.id,
        det,
        last,
        score,
      ]);
      if (offlineSync) {
        await c.query("INSERT INTO sync_history(node_id, received_at, events_synced, outage_start, outage_end) VALUES ($1,$2,$3,$4,$5)", [h.node.id, new Date(last.getTime() + 600_000), Math.round(between(2, 12)), det, last]);
      }
    }
    void r;
  }

  // 3) Current situation (matches the dashboard design): G-402 acknowledged warning, AS-N-019 offline,
  //    F-201 open warning, P-101 open anomaly (newest, #A-2311). TX-M1 is "rising" with no alert yet.
  const N = (id: string) => nodeById.get(id)!;
  const minute = 60_000;
  const cur = [
    { n: N("AS-N-012"), sev: "Warning", at: now - 130 * minute, dur: 20, score: 0.058, status: "Acknowledged", assignee: "Faaiz Khan" },
    { n: N("AS-N-019"), sev: "Offline", at: now - 123 * minute, dur: 0, score: null, status: "Open", assignee: null },
    { n: N("AS-N-003"), sev: "Warning", at: now - 24 * minute, dur: 6, score: 0.053, status: "Open", assignee: null },
    { n: N("AS-N-007"), sev: "Anomaly", at: now - 4 * minute - 30_000, dur: 1.5, score: 0.071, status: "Open", assignee: null },
  ];
  const alertIds: number[] = [];
  for (const a of cur) {
    const r = await c.query<{ id: number }>(
      `INSERT INTO alerts(node_id, machine_id, site_id, severity, score, threshold, windows, detected_at, last_event_at, received_at, delivered_via, status,
                          assignee_id, acknowledged_by, acknowledged_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$8,'MQTT live',$10,$11,$12,$13) RETURNING id`,
      [
        a.n.id,
        ids.machineIds.get(a.n.id),
        ids.siteIds.get(a.n.site),
        a.sev,
        a.score,
        a.sev === "Offline" ? null : a.n.threshold,
        a.sev === "Anomaly" ? 9 : a.sev === "Warning" ? 3 : 1,
        new Date(a.at),
        new Date(a.at + a.dur * minute),
        a.status,
        a.assignee ? userIds.get(a.assignee) : null,
        a.status === "Acknowledged" ? userIds.get("Faaiz Khan") : null,
        a.status === "Acknowledged" ? new Date(a.at + 11 * minute) : null,
      ],
    );
    alertIds.push(r.rows[0].id);
  }

  // Shape the latest telemetry so the shared severity rule yields the designed statuses.
  const lastPoints = async (id: string, k: number) =>
    (await c.query<{ id: number }>("SELECT id FROM telemetry WHERE node_id = $1 ORDER BY event_time DESC LIMIT $2", [id, k])).rows.map((r) => r.id).reverse();
  const setScores = async (id: string, values: number[]) => {
    const pts = await lastPoints(id, values.length);
    for (let i = 0; i < pts.length; i++) await c.query("UPDATE telemetry SET score = $2 WHERE id = $1", [pts[i], values[i]]);
  };
  await setScores("AS-N-007", [0.047, 0.05, 0.053, 0.056, 0.058, 0.061, 0.063, 0.066, 0.068, 0.071]);
  await setScores("AS-N-003", [0.034, 0.041, 0.052, 0.053]);
  await setScores("AS-N-012", [0.031, 0.04, 0.047]);
  await setScores("AS-N-021", [0.014, 0.016, 0.018, 0.02, 0.022, 0.024, 0.026]);

  // Node + machine state from the newest telemetry, via the shared severity rule.
  for (const n of fleet.nodes) {
    const last = (await c.query<{ event_time: Date }>("SELECT event_time FROM telemetry WHERE node_id = $1 ORDER BY event_time DESC LIMIT 1", [n.id])).rows[0];
    const scores = (await c.query<{ score: number }>("SELECT score FROM telemetry WHERE node_id = $1 ORDER BY event_time DESC LIMIT 16", [n.id])).rows.map((r) => r.score).reverse();
    const lastHb = n.role === "offline" ? last.event_time : new Date(now);
    if (n.role !== "offline") await c.query("UPDATE telemetry SET event_time = $2, received_at = $2 WHERE id = (SELECT id FROM telemetry WHERE node_id = $1 ORDER BY event_time DESC LIMIT 1)", [n.id, lastHb]);
    await c.query("UPDATE nodes SET last_heartbeat_at = $2 WHERE id = $1", [n.id, lastHb]);
    const status = classifySeverity({ scores, threshold: n.threshold, lastHeartbeatAt: lastHb, cfg: DEFAULT_DETECTION, now: new Date(now) });
    const lastEvent = (await c.query<{ t: Date }>("SELECT max(detected_at) t FROM alerts WHERE node_id = $1", [n.id])).rows[0]?.t ?? null;
    await c.query("UPDATE machines SET status = $2, score = $3, last_event_at = $4 WHERE id = $1", [ids.machineIds.get(n.id), status, scores[scores.length - 1], lastEvent]);
  }
  await c.query("UPDATE nodes SET recalibration_requested_at = NULL");

  // 4) Notifications for active users (recent unread, older read).
  const recent = (await c.query<{ id: number; severity: string; score: number | null; threshold: number | null; node_id: string; machine: string; site_id: number; detected_at: Date }>(
    `SELECT a.id, a.severity, a.score, a.threshold, a.node_id, m.name machine, a.site_id, a.detected_at FROM alerts a JOIN machines m ON m.id = a.machine_id ORDER BY a.detected_at DESC LIMIT 10`,
  )).rows;
  for (const u of USERS.filter((x) => x.status === "active")) {
    const uid = userIds.get(u.name)!;
    const allowed = u.role === "admin" ? [...ids.siteIds.values()] : u.sites.map((s) => ids.siteIds.get(s)!);
    for (const a of recent) {
      if (!allowed.includes(a.site_id)) continue;
      const body = a.severity === "Offline" ? `No heartbeat from node ${a.node_id}` : `Score ${a.score?.toFixed(3)} vs threshold ${a.threshold?.toFixed(3)}`;
      const unread = alertIds.includes(a.id) && a.id !== alertIds[0];
      await c.query("INSERT INTO notifications(user_id, alert_id, severity, title, body, created_at, read_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
        uid,
        a.id,
        a.severity,
        `${a.machine}: ${a.severity}`,
        body,
        a.detected_at,
        unread ? null : new Date(a.detected_at.getTime() + 600_000),
      ]);
    }
  }

  // 5) A few audit entries so the Audit log is not empty.
  const admin = userIds.get("Hamza Ranjha");
  const audits: [number | null, string, string, string, object | null, number][] = [
    [admin!, "Hamza Ranjha", "user.created", "faaiz.khan@acousticsense.local", { role: "engineer" }, 20],
    [admin!, "Hamza Ranjha", "user.created", "ayesha.tariq@acousticsense.local", { role: "engineer" }, 20],
    [admin!, "Hamza Ranjha", "user.created", "usman.ali@acousticsense.local", { role: "viewer" }, 19],
    [admin!, "Hamza Ranjha", "user.disabled", "bilal.ahmed@acousticsense.local", { status: { old: "active", new: "disabled" } }, 6],
    [userIds.get("Faaiz Khan")!, "Faaiz Khan", "alert.acknowledged", `A-${2180 + alertIds[0]}`, null, 0.08],
    [null, "System", "seed.run", "demo data", { reset: true }, 0],
  ];
  for (const [uid, name, action, target, details, daysAgo] of audits) {
    await c.query("INSERT INTO audit_log(at, user_id, user_name, action, target, details) VALUES ($1,$2,$3,$4,$5,$6)", [
      new Date(now - daysAgo * 86400_000),
      uid,
      name,
      action,
      target,
      details ? JSON.stringify(details) : null,
    ]);
  }
  const counts = (await c.query<{ t: number; a: number }>("SELECT (SELECT count(*)::int FROM telemetry) t, (SELECT count(*)::int FROM alerts) a")).rows[0];
  console.log(`[seed] history: ${counts.t} telemetry rows, ${counts.a} alerts (newest #A-${2180 + alertIds[alertIds.length - 1]})`);
}

main().catch((e) => {
  console.error("[seed] failed:", e.message);
  if (e.code === "ECONNREFUSED") console.error("        Is the database running? Start it with `npm run db`.");
  process.exit(1);
});
