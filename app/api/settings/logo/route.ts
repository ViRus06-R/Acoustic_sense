import { NextResponse } from "next/server";
import { q } from "@/lib/server/db";
import { route, badRequest } from "@/lib/server/http";
import { getSetting, saveSetting } from "@/lib/server/settings";
import { audit } from "@/lib/server/audit";

const MAX = 1024 * 1024;

function sniff(buf: Buffer): "image/png" | "image/svg+xml" | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

export const POST = route({ roles: ["admin"] }, async (req, { user }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw badRequest("Choose a PNG or SVG file.", { logo: "Choose a file" });
  if (file.size > MAX) throw badRequest("Logo must be 1 MB or smaller.", { logo: "Max 1 MB" });
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniff(buf);
  if (!mime) throw badRequest("Only PNG or SVG files are allowed.", { logo: "PNG or SVG only" });
  if (mime === "image/svg+xml" && /<script|on\w+\s*=|javascript:/i.test(buf.toString("utf8"))) {
    throw badRequest("SVG contains scripts and was rejected.", { logo: "SVG must not contain scripts" });
  }
  await q(
    `INSERT INTO settings(key, value, updated_by) VALUES ('logo', $1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [JSON.stringify({ mime, data: buf.toString("base64") }), user.id],
  );
  const g = await getSetting("general");
  await saveSetting("general", { ...g, hasLogo: true }, user.id);
  await audit(user, "settings.logo_uploaded", "Settings > general", { mime, bytes: buf.length });
  return NextResponse.json({ ok: true });
});

export const DELETE = route({ roles: ["admin"] }, async (_req, { user }) => {
  await q("DELETE FROM settings WHERE key = 'logo'");
  const g = await getSetting("general");
  await saveSetting("general", { ...g, hasLogo: false }, user.id);
  await audit(user, "settings.logo_removed", "Settings > general");
  return NextResponse.json({ ok: true });
});
