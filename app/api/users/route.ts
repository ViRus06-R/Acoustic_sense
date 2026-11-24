import { NextResponse } from "next/server";
import { z } from "zod";
import { q, q1 } from "@/lib/server/db";
import { route, body, badRequest } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { sendPasswordLink, setUserSites } from "@/lib/server/users";

export const GET = route({ roles: ["admin"] }, async (req) => {
  const sp = req.nextUrl.searchParams;
  const text = (sp.get("q") ?? "").trim();
  const role = sp.get("role");
  const status = sp.get("status");
  const sort = sp.get("sort") === "lastLogin" ? "u.last_login_at DESC NULLS LAST, u.name" : "u.name";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 10));
  const args: unknown[] = [text ? `%${text.replace(/[%_\\]/g, "")}%` : null, role && role !== "All" ? role : null, null];
  if (status === "Locked") args[2] = "locked";
  else if (status && status !== "All") args[2] = status.toLowerCase();
  const where = `($1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1) AND ($2::text IS NULL OR u.role = $2)
     AND ($3::text IS NULL OR ($3 = 'locked' AND u.locked_until > now()) OR u.status = $3)`;
  const total = await q1<{ n: number }>(`SELECT count(*)::int n FROM users u WHERE ${where}`, args as never[]);
  const rows = await q(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.notify_via "notifyVia", u.status, u.last_login_at "lastLoginAt",
            (u.locked_until IS NOT NULL AND u.locked_until > now()) locked, u.locked_until "lockedUntil",
            (u.password_hash IS NULL) "pendingSetup",
            COALESCE((SELECT array_agg(s.id ORDER BY s.name) FROM user_sites us JOIN sites s ON s.id = us.site_id WHERE us.user_id = u.id), '{}') "siteIds",
            COALESCE((SELECT array_agg(s.name ORDER BY s.name) FROM user_sites us JOIN sites s ON s.id = us.site_id WHERE us.user_id = u.id), '{}') "siteNames"
       FROM users u WHERE ${where} ORDER BY ${sort} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    args as never[],
  );
  return NextResponse.json({ items: rows, total: total!.n, page, pageSize });
});

const schema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  role: z.enum(["admin", "engineer", "viewer"]),
  notifyVia: z.enum(["Push", "Email", "Push + email"]),
  siteIds: z.array(z.number().int().positive()).max(100),
});

export const POST = route({ roles: ["admin"] }, async (req, { user }) => {
  const b = await body(req, schema);
  if (b.role !== "admin" && b.siteIds.length === 0) throw badRequest("Select at least one site.", { siteIds: "Select at least one site" });
  if (await q1("SELECT 1 FROM users WHERE lower(email) = lower($1)", [b.email])) throw badRequest("A user with this email already exists.", { email: "Already in use" });
  const r = await q1<{ id: number }>("INSERT INTO users(name, email, role, notify_via) VALUES ($1,$2,$3,$4) RETURNING id", [b.name, b.email, b.role, b.notifyVia]);
  await setUserSites(r!.id, b.siteIds);
  const mail = await sendPasswordLink({ id: r!.id, name: b.name, email: b.email }, "set");
  await audit(user, "user.created", b.email, { name: b.name, role: b.role, siteIds: b.siteIds, notifyVia: b.notifyVia });
  return NextResponse.json({ id: r!.id, devMail: mail.file ? `dev-mail/${mail.id}.eml` : null }, { status: 201 });
});
