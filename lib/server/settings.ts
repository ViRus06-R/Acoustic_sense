import { q } from "./db";
import { DEFAULT_SETTINGS, SETTINGS_KEYS, SETTINGS_SCHEMAS, type Settings, type SettingsKey } from "@/lib/shared/settings-schema";
import type { DetectionConfig } from "@/lib/shared/domain";

type G = typeof globalThis & { __asSettingsCache?: { at: number; value: Settings } };
const g = globalThis as G;
const TTL_MS = 3000;

/** Typed accessor with defaults in code. Stored values are merged over defaults and re-validated. */
export async function getSettings(): Promise<Settings> {
  if (g.__asSettingsCache && Date.now() - g.__asSettingsCache.at < TTL_MS) return g.__asSettingsCache.value;
  const rows = await q<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const out = structuredClone(DEFAULT_SETTINGS) as Settings;
  for (const r of rows) {
    if (!(SETTINGS_KEYS as string[]).includes(r.key)) continue;
    const key = r.key as SettingsKey;
    const merged = { ...(DEFAULT_SETTINGS[key] as object), ...(r.value as object) };
    const parsed = SETTINGS_SCHEMAS[key].safeParse(merged);
    if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
  }
  g.__asSettingsCache = { at: Date.now(), value: out };
  return out;
}

export async function getSetting<K extends SettingsKey>(key: K): Promise<Settings[K]> {
  return (await getSettings())[key];
}

export async function saveSetting<K extends SettingsKey>(key: K, value: Settings[K], userId: number | null) {
  await q(
    `INSERT INTO settings(key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), userId],
  );
  g.__asSettingsCache = undefined;
}

export function invalidateSettingsCache() {
  g.__asSettingsCache = undefined;
}

export async function detectionConfig(persistenceOverride?: number | null): Promise<DetectionConfig> {
  const d = await getSetting("detection");
  return {
    persistenceWindows: persistenceOverride ?? d.persistenceWindows,
    warningRatio: d.warningRatio,
    risingWindows: d.risingWindows,
    heartbeatTimeoutSec: d.heartbeatTimeoutSec,
  };
}
