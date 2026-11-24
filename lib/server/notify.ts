import { q } from "./db";
import { getSettings } from "./settings";
import { publish } from "./realtime";
import { appUrl, mailer } from "./mailer";
import { alertCode, type AlertSeverity } from "@/lib/shared/domain";
import { fmtScore } from "@/lib/shared/format";

interface Recipient {
  id: number;
  name: string;
  email: string;
  notify_via: string;
  role: string;
}

export function inQuietHours(qh: { enabled: boolean; start: string; end: string }, timeZone: string, now = new Date()): boolean {
  if (!qh.enabled) return false;
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const cur = hm;
  return qh.start <= qh.end ? cur >= qh.start && cur < qh.end : cur >= qh.start || cur < qh.end;
}

async function recipientsForSite(siteId: number, rolesOnly?: string[]): Promise<Recipient[]> {
  return q<Recipient>(
    `SELECT u.id, u.name, u.email, u.notify_via, u.role FROM users u
      WHERE u.status = 'active' AND u.password_hash IS NOT NULL
        AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM user_sites us WHERE us.user_id = u.id AND us.site_id = $1))
        AND ($2::text[] IS NULL OR u.role = ANY($2))`,
    [siteId, rolesOnly ?? null],
  );
}

export interface AlertForNotify {
  id: number;
  severity: AlertSeverity;
  site_id: number;
  score: number | null;
  threshold: number | null;
  machine_name: string | null;
  node_id: string;
}

export function alertTitle(a: AlertForNotify) {
  return `${a.machine_name ?? a.node_id}: ${a.severity}`;
}
export function alertBody(a: AlertForNotify) {
  if (a.severity === "Offline") return `No heartbeat from node ${a.node_id}`;
  return `Score ${fmtScore(a.score)} vs threshold ${fmtScore(a.threshold)}`;
}

/** Fan out a new/upgraded alert according to Settings > Notifications and each user's preference. */
export async function notifyAlert(a: AlertForNotify, opts: { escalation?: boolean } = {}) {
  const s = await getSettings();
  const ch = s.notifications.matrix[a.severity];
  const quiet = inQuietHours(s.notifications.quietHours, s.general.timezone);
  const users = await recipientsForSite(a.site_id, opts.escalation ? ["admin"] : undefined);
  const title = (opts.escalation ? "Escalation - " : "") + alertTitle(a);
  const body = opts.escalation ? `Still open after ${s.notifications.escalation.minutes} min. ${alertBody(a)}` : alertBody(a);
  for (const u of users) {
    const wantsPush = u.notify_via.includes("Push");
    const wantsEmail = u.notify_via.toLowerCase().includes("email");
    if (ch.inApp || opts.escalation) {
      await q("INSERT INTO notifications(user_id, alert_id, severity, title, body) VALUES ($1,$2,$3,$4,$5)", [u.id, a.id, a.severity, title, body]);
    }
    // "Push" is delivered as a live toast in the web app (no mobile push service in this demo).
    if ((ch.inApp || opts.escalation) || (ch.push && wantsPush && !quiet)) {
      publish({ type: "notification", userId: u.id, title, body, severity: a.severity, alertId: a.id });
    }
    if ((ch.email || opts.escalation) && wantsEmail && !quiet) {
      await mailer()
        .send({
          to: u.email,
          subject: `[Acoustic Sense] ${title}`,
          text: `Hello ${u.name},\n\n${title}\n${body}\n\nOpen alert #${alertCode(a.id)}: ${appUrl(`/alerts?id=${a.id}`)}\n`,
        })
        .catch((e) => console.error("[notify] mail failed", e));
    }
  }
}

export async function notifyUser(userId: number, n: { title: string; body: string; severity: string; alertId: number | null; email?: boolean }) {
  await q("INSERT INTO notifications(user_id, alert_id, severity, title, body) VALUES ($1,$2,$3,$4,$5)", [userId, n.alertId, n.severity, n.title, n.body]);
  publish({ type: "notification", userId, title: n.title, body: n.body, severity: n.severity, alertId: n.alertId });
  if (n.email) {
    const u = (await q<Recipient>("SELECT id, name, email, notify_via, role FROM users WHERE id = $1", [userId]))[0];
    if (u && u.notify_via.toLowerCase().includes("email")) {
      await mailer().send({ to: u.email, subject: `[Acoustic Sense] ${n.title}`, text: `Hello ${u.name},\n\n${n.body}\n\n${n.alertId ? appUrl(`/alerts?id=${n.alertId}`) : appUrl("/")}\n` });
    }
  }
}
