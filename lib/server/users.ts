import { q, q1 } from "./db";
import { issueAuthToken } from "./auth";
import { appUrl, mailer } from "./mailer";
import { getSetting } from "./settings";
import type { Role } from "@/lib/shared/domain";

export async function sendPasswordLink(user: { id: number; name: string; email: string }, purpose: "set" | "reset") {
  const token = await issueAuthToken(user.id, purpose);
  const hours = (await getSetting("security")).linkExpiryHours;
  const path = purpose === "set" ? `/set-password?token=${token}` : `/reset-password?token=${token}`;
  const subject = purpose === "set" ? "Welcome to Acoustic Sense - set your password" : "Reset your Acoustic Sense password";
  const intro =
    purpose === "set"
      ? `Hello ${user.name},\n\nAn administrator created an Acoustic Sense account for you.\nSet your password with this one-time link (expires in ${hours} hours):`
      : `Hello ${user.name},\n\nAn administrator reset your password. Choose a new one with this one-time link (expires in ${hours} hours):`;
  return mailer().send({ to: user.email, subject, text: `${intro}\n${appUrl(path)}\n` });
}

/**
 * Last-admin protection (pure, unit-tested).
 * - An admin cannot demote or disable themselves.
 * - The last active admin cannot be demoted or disabled.
 */
export function checkAdminChange(input: {
  actorId: number;
  targetId: number;
  targetRole: Role;
  targetStatus: "active" | "disabled";
  newRole: Role;
  newStatus: "active" | "disabled";
  activeAdminCount: number;
}): string | null {
  const losingAdmin = input.targetRole === "admin" && input.targetStatus === "active" && (input.newRole !== "admin" || input.newStatus !== "active");
  if (!losingAdmin) return null;
  if (input.actorId === input.targetId) {
    return input.newStatus !== "active" ? "You cannot disable your own account." : "You cannot remove your own Admin role.";
  }
  if (input.activeAdminCount <= 1) return "The last remaining Admin cannot be demoted or disabled.";
  return null;
}

export async function activeAdminCount() {
  return (await q1<{ n: number }>("SELECT count(*)::int n FROM users WHERE role = 'admin' AND status = 'active'"))!.n;
}

export async function setUserSites(userId: number, siteIds: number[]) {
  await q("DELETE FROM user_sites WHERE user_id = $1", [userId]);
  for (const s of [...new Set(siteIds)]) await q("INSERT INTO user_sites(user_id, site_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [userId, s]);
}
