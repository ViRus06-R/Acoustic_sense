import { NextResponse } from "next/server";
import { z } from "zod";
import { q1 } from "@/lib/server/db";
import { publicRoute, body } from "@/lib/server/http";
import { clientIp, issueAuthToken } from "@/lib/server/auth";
import { limiter } from "@/lib/server/ratelimit";
import { appUrl, mailer } from "@/lib/server/mailer";
import { audit } from "@/lib/server/audit";
import { getSetting } from "@/lib/server/settings";

const schema = z.object({ email: z.string().trim().max(254) });
const SAME = { message: "If an account exists for that email, a reset link has been sent." };

export const POST = publicRoute(async (req) => {
  const { email } = await body(req, schema);
  const ipOk = limiter("forgot-ip", 5, 3600_000).hit(clientIp(req));
  const emailOk = limiter("forgot-email", 5, 3600_000).hit(email.toLowerCase());
  if (!ipOk || !emailOk) {
    return NextResponse.json({ error: "Too many requests. Please try again in an hour." }, { status: 429 });
  }
  const user = await q1<{ id: number; name: string; email: string; status: string }>(
    "SELECT id, name, email, status FROM users WHERE lower(email) = lower($1)",
    [email],
  );
  if (user && user.status === "active") {
    const token = await issueAuthToken(user.id, "reset");
    const hours = (await getSetting("security")).linkExpiryHours;
    await mailer().send({
      to: user.email,
      subject: "Reset your Acoustic Sense password",
      text: `Hello ${user.name},\n\nUse this link to reset your password. It expires in ${hours} hours and can be used once:\n${appUrl(`/reset-password?token=${token}`)}\n\nIf you did not request this, you can ignore this email.`,
    });
    await audit({ id: user.id, name: user.name }, "auth.reset_requested", user.email, { ip: clientIp(req) });
  }
  return NextResponse.json(SAME);
});
