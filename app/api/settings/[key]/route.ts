import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { route, body, param, notFound } from "@/lib/server/http";
import { getSettings, saveSetting } from "@/lib/server/settings";
import { audit, diff } from "@/lib/server/audit";
import { restartMqtt } from "@/lib/server/mqtt";
import { SETTINGS_KEYS, SETTINGS_SCHEMAS, type SettingsKey } from "@/lib/shared/settings-schema";

/** Validate (Zod), apply immediately, write audit entry with old/new values. */
export const PUT = route({ roles: ["admin"] }, async (req, { user, params }) => {
  const key = param(params, "key") as SettingsKey;
  if (!SETTINGS_KEYS.includes(key)) throw notFound("Unknown settings section");
  const before = (await getSettings())[key];
  const raw = (await body(req, SETTINGS_SCHEMAS[key] as unknown as ZodType<Record<string, unknown>>));
  // The logo flag is managed by the upload endpoint only.
  const value = key === "general" ? { ...raw, hasLogo: (before as { hasLogo: boolean }).hasLogo } : raw;
  await saveSetting(key, value as never, user.id);
  const changes = diff(before as Record<string, unknown>, value);
  if (Object.keys(changes).length) await audit(user, `settings.${key}_updated`, `Settings > ${key}`, changes);
  if (key === "broker") {
    const b = before as { host: string; port: number; tls: boolean; topicPrefix: string; qosAlerts: number; qosTelemetry: number };
    const n = value as typeof b;
    if (b.host !== n.host || b.port !== n.port || b.tls !== n.tls || b.topicPrefix !== n.topicPrefix || b.qosAlerts !== n.qosAlerts || b.qosTelemetry !== n.qosTelemetry) {
      await restartMqtt(); // reconnects without a server restart
    }
  }
  return NextResponse.json({ ok: true, value });
});
