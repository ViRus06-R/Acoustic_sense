import { NextResponse } from "next/server";
import { z } from "zod";
import { q, q1 } from "@/lib/server/db";
import { route, body, intParam, notFound, badRequest } from "@/lib/server/http";
import { audit, diff } from "@/lib/server/audit";
import { revokeSessions } from "@/lib/server/auth";
import { activeAdminCount, checkAdminChange, setUserSites } from "@/lib/server/users";
import { publish } from "@/lib/server/realtime";
import type { Role } from "@/lib/shared/domain";

const schema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(80).optional(),
  role: z.enum(["admin", "engineer", "viewer"]).optional(),
  notifyVia: z.enum(["Push", "Email", "Push + email"]).optional(),
  siteIds: z.array(z.number().int().positive()).max(100).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const PATCH = route({ roles: ["admin"] }, async (req, { user, params }) => {
  const id = intParam(params, "id");
  const b = await body(req, schema);
  const target = await q1<{ id: number; name: string; email: string; role: Role; status: "active" | "disabled"; notify_via: string }>(
    "SELECT id, name, email, role, status, notify_via FROM users WHERE id = $1",
    [id],
  );
  if (!target) throw notFound("User not found");
  const newRole = b.role ?? target.role;
  const newStatus = b.status ?? target.status;
  const err = checkAdminChange({
    actorId: user.id,
    targetId: id,
    targetRole: target.role,
    targetStatus: target.status,
    newRole,
    newStatus,
    activeAdminCount: await activeAdminCount(),
  });
  if (err) throw badRequest(err, b.status ? { status: err } : { role: err });
  const beforeSites = (await q<{ site_id: number }>("SELECT site_id FROM user_sites WHERE user_id = $1 ORDER BY site_id", [id])).map((r) => r.site_id);
  if (b.siteIds && newRole !== "admin" && b.siteIds.length === 0) throw badRequest("Select at least one site.", { siteIds: "Select at least one site" });

  await q("UPDATE users SET name = COALESCE($2, name), role = $3, notify_via = COALESCE($4, notify_via), status = $5 WHERE id = $1", [id, b.name ?? null, newRole, b.notifyVia ?? null, newStatus]);
  if (b.siteIds) await setUserSites(id, b.siteIds);
  if (newStatus === "disabled" && target.status !== "disabled") {
    await revokeSessions(id);
    publish({ type: "session-revoked", userId: id });
  }
  const action = b.status && b.status !== target.status ? (b.status === "disabled" ? "user.disabled" : "user.enabled") : "user.updated";
  await audit(
    user,
    action,
    target.email,
    diff(
      { name: target.name, role: target.role, notifyVia: target.notify_via, status: target.status, siteIds: beforeSites },
      { name: b.name ?? target.name, role: newRole, notifyVia: b.notifyVia ?? target.notify_via, status: newStatus, siteIds: b.siteIds ? [...b.siteIds].sort((x, y) => x - y) : beforeSites },
    ),
  );
  return NextResponse.json({ ok: true });
});
