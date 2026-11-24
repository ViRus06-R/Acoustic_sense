import { NextResponse } from "next/server";
import { route } from "@/lib/server/http";
import { mailer } from "@/lib/server/mailer";
import { publish } from "@/lib/server/realtime";
import { q } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";

export const POST = route({ roles: ["admin"] }, async (_req, { user }) => {
  const title = "Test notification";
  const text = "This is a test notification from Settings > Notifications.";
  await q("INSERT INTO notifications(user_id, severity, title, body) VALUES ($1,'Warning',$2,$3)", [user.id, title, text]);
  publish({ type: "notification", userId: user.id, title, body: text, severity: "Warning", alertId: null });
  const mail = await mailer().send({ to: user.email, subject: `[Acoustic Sense] ${title}`, text: `Hello ${user.name},\n\n${text}\n` });
  await audit(user, "settings.test_notification", user.email);
  return NextResponse.json({ ok: true, file: `dev-mail/${mail.id}.eml` });
});
