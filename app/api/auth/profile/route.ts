import { NextResponse } from "next/server";
import { z } from "zod";
import { q } from "@/lib/server/db";
import { route, body } from "@/lib/server/http";
import { audit, diff } from "@/lib/server/audit";

const schema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+0-9 \-()]*$/, "Digits, spaces, + - ( ) only")
    .optional()
    .transform((v) => v || null),
  notifyVia: z.enum(["Push", "Email", "Push + email"]),
});

export const PATCH = route({}, async (req, { user }) => {
  const b = await body(req, schema);
  await q("UPDATE users SET name = $2, phone = $3, notify_via = $4 WHERE id = $1", [user.id, b.name, b.phone, b.notifyVia]);
  await audit({ id: user.id, name: b.name }, "user.profile_updated", user.email, diff({ name: user.name, phone: user.phone, notifyVia: user.notifyVia }, b));
  return NextResponse.json({ ok: true });
});
