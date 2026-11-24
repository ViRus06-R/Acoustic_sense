import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24 h)");

export const generalSchema = z.object({
  orgName: z.string().trim().min(2, "At least 2 characters").max(80),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone"),
  dateFormat: z.enum(["DD MMM YYYY, HH:mm", "YYYY-MM-DD HH:mm", "MM/DD/YYYY hh:mm a"]),
  language: z.literal("en"),
  hasLogo: z.boolean(),
});

export const detectionSchema = z
  .object({
    thresholdMethod: z.enum(["meanKStd", "percentile"]),
    k: z.number().min(0.5, "Min 0.5").max(10, "Max 10"),
    percentile: z.number().min(50, "Min 50").max(99.99, "Max 99.99"),
    persistenceWindows: z.number().int().min(1, "Min 1").max(120, "Max 120"),
    warningRatio: z.number().min(0.1, "Min 0.1").max(1, "Max 1 (= threshold)"),
    risingWindows: z.number().int().min(0, "Min 0").max(60, "Max 60"),
    heartbeatTimeoutSec: z.number().int().min(15, "Min 15 s").max(3600, "Max 3600 s"),
    dedupWindowMin: z.number().int().min(0, "Min 0").max(1440, "Max 1440"),
  })
  .strict();

const channelToggles = z.object({ inApp: z.boolean(), push: z.boolean(), email: z.boolean() });
export const notificationsSchema = z
  .object({
    matrix: z.object({ Warning: channelToggles, Anomaly: channelToggles, Offline: channelToggles }),
    quietHours: z.object({ enabled: z.boolean(), start: hhmm, end: hhmm }),
    escalation: z.object({ enabled: z.boolean(), minutes: z.number().int().min(1, "Min 1").max(1440, "Max 1440") }),
  })
  .strict();

export const securitySchema = z
  .object({
    minLength: z.number().int().min(8, "Min 8").max(64, "Max 64"),
    requireNumber: z.boolean(),
    requireSymbol: z.boolean(),
    lockoutAttempts: z.number().int().min(3, "Min 3").max(20, "Max 20"),
    lockoutMinutes: z.number().int().min(1, "Min 1").max(1440, "Max 1440"),
    sessionTimeoutMin: z.number().int().min(5, "Min 5").max(10080, "Max 10080"),
    linkExpiryHours: z.number().int().min(1, "Min 1").max(168, "Max 168"),
  })
  .strict();

export const brokerSchema = z
  .object({
    host: z
      .string()
      .trim()
      .min(1, "Required")
      .max(253)
      .regex(/^[A-Za-z0-9.\-]+$/, "Hostname or IP only"),
    port: z.number().int().min(1).max(65535),
    tls: z.boolean(),
    topicPrefix: z.string().regex(/^[a-z0-9_\-]+$/, "Lower-case letters, digits, - and _"),
    qosAlerts: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    qosTelemetry: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  })
  .strict();

export const retentionSchema = z
  .object({
    telemetryDays: z.number().int().min(7, "Min 7 days").max(3650, "Max 3650 days"),
    alertRetention: z.enum(["keep", "365", "730", "1825"]),
  })
  .strict();

export const SETTINGS_SCHEMAS = {
  general: generalSchema,
  detection: detectionSchema,
  notifications: notificationsSchema,
  security: securitySchema,
  broker: brokerSchema,
  retention: retentionSchema,
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type Settings = { [K in SettingsKey]: z.infer<(typeof SETTINGS_SCHEMAS)[K]> };

export const DEFAULT_SETTINGS: Settings = {
  general: {
    orgName: "Acoustic Sense",
    timezone: "Asia/Karachi",
    dateFormat: "DD MMM YYYY, HH:mm",
    language: "en",
    hasLogo: false,
  },
  detection: {
    thresholdMethod: "meanKStd",
    k: 3,
    percentile: 99,
    persistenceWindows: 9,
    warningRatio: 0.85,
    risingWindows: 5,
    heartbeatTimeoutSec: 120,
    dedupWindowMin: 15,
  },
  notifications: {
    matrix: {
      Warning: { inApp: true, push: false, email: false },
      Anomaly: { inApp: true, push: true, email: true },
      Offline: { inApp: true, push: true, email: false },
    },
    quietHours: { enabled: false, start: "22:00", end: "07:00" },
    escalation: { enabled: true, minutes: 30 },
  },
  security: {
    minLength: 10,
    requireNumber: true,
    requireSymbol: true,
    lockoutAttempts: 5,
    lockoutMinutes: 15,
    sessionTimeoutMin: 480,
    linkExpiryHours: 24,
  },
  broker: {
    host: "127.0.0.1",
    port: 1883,
    tls: false,
    topicPrefix: "acousticsense",
    qosAlerts: 1,
    qosTelemetry: 0,
  },
  retention: { telemetryDays: 90, alertRetention: "keep" },
};

export const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingsKey[];
