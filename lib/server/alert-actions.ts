import { q1 } from "./db";
import { assertSite, badRequest, notFound } from "./http";
import type { AuthUser } from "./auth";
import { alertCode } from "@/lib/shared/domain";

export async function loadAlertForAction(user: AuthUser, id: number) {
  const a = await q1<{ id: number; site_id: number; status: string; severity: string; node_id: string; machine_id: number | null; score: number | null; threshold: number | null }>(
    "SELECT id, site_id, status, severity, node_id, machine_id, score, threshold FROM alerts WHERE id = $1",
    [id],
  );
  if (!a) throw notFound("Alert not found");
  assertSite(user, a.site_id);
  if (a.status === "Resolved") throw badRequest("This alert is already resolved.");
  return { ...a, code: alertCode(a.id) };
}
