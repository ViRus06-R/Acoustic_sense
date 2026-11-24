import { describe, expect, it } from "vitest";
import { checkPasswordPolicy, passwordStrength, DEFAULT_POLICY } from "@/lib/shared/password";
import { RateLimiter } from "@/lib/server/ratelimit";
import { evaluateToken } from "@/lib/server/auth";
import { checkAdminChange } from "@/lib/server/users";
import { SETTINGS_SCHEMAS, DEFAULT_SETTINGS } from "@/lib/shared/settings-schema";
import { inQuietHours } from "@/lib/server/notify";

describe("password policy", () => {
  it("enforces length, number and symbol", () => {
    expect(checkPasswordPolicy("short1!", DEFAULT_POLICY).ok).toBe(false);
    expect(checkPasswordPolicy("longenoughpassword", DEFAULT_POLICY).ok).toBe(false);
    expect(checkPasswordPolicy("longenough123", DEFAULT_POLICY).ok).toBe(false);
    expect(checkPasswordPolicy("AcousticDemo#2026", DEFAULT_POLICY).ok).toBe(true);
  });
  it("follows the configured policy", () => {
    const relaxed = { minLength: 8, requireNumber: false, requireSymbol: false };
    expect(checkPasswordPolicy("abcdefgh", relaxed).ok).toBe(true);
    expect(checkPasswordPolicy("a".repeat(129), relaxed).ok).toBe(false);
  });
  it("rates strength", () => {
    expect(passwordStrength("password").score).toBeLessThanOrEqual(1);
    expect(passwordStrength("Tr0ub4dor&3-horse").score).toBe(4);
  });
});

describe("rate limiting", () => {
  it("allows 5 requests per window and blocks the 6th", () => {
    const rl = new RateLimiter(5, 3600_000);
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rl.hit("ip", t + i)).toBe(true);
    expect(rl.hit("ip", t + 10)).toBe(false);
    expect(rl.hit("other-ip", t + 10)).toBe(true);
  });
  it("allows again after the window passes", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.hit("k", 0)).toBe(true);
    expect(rl.hit("k", 1)).toBe(true);
    expect(rl.hit("k", 2)).toBe(false);
    expect(rl.hit("k", 1001)).toBe(true);
  });
});

describe("one-time token expiry and reuse", () => {
  const now = new Date("2026-11-24T10:00:00Z");
  const row = { id: 1, user_id: 7, purpose: "reset", expires_at: new Date(now.getTime() + 3600_000), used_at: null as Date | null, name: "Faaiz Khan", email: "f@x", status: "active" };
  it("accepts a fresh unused token", () => {
    expect(evaluateToken(row, "reset", now)).toMatchObject({ ok: true, userId: 7 });
  });
  it("rejects an expired token", () => {
    expect(evaluateToken({ ...row, expires_at: new Date(now.getTime() - 1) }, "reset", now)).toEqual({ ok: false, reason: "expired" });
  });
  it("rejects a reused token", () => {
    expect(evaluateToken({ ...row, used_at: new Date(now.getTime() - 60_000) }, "reset", now)).toEqual({ ok: false, reason: "used" });
  });
  it("rejects unknown tokens, wrong purpose and disabled users", () => {
    expect(evaluateToken(null, "reset", now)).toEqual({ ok: false, reason: "invalid" });
    expect(evaluateToken(row, "set", now)).toEqual({ ok: false, reason: "invalid" });
    expect(evaluateToken({ ...row, status: "disabled" }, "reset", now)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("last-admin protection", () => {
  const base = { actorId: 1, targetId: 2, targetRole: "admin" as const, targetStatus: "active" as const, newRole: "admin" as const, newStatus: "active" as const, activeAdminCount: 2 };
  it("lets an admin demote another admin when another admin remains", () => {
    expect(checkAdminChange({ ...base, newRole: "engineer" })).toBeNull();
  });
  it("blocks demoting or disabling the last admin", () => {
    expect(checkAdminChange({ ...base, newRole: "viewer", activeAdminCount: 1 })).toMatch(/last remaining Admin/);
    expect(checkAdminChange({ ...base, newStatus: "disabled", activeAdminCount: 1 })).toMatch(/last remaining Admin/);
  });
  it("blocks an admin removing their own role or disabling themselves", () => {
    expect(checkAdminChange({ ...base, targetId: 1, newRole: "engineer" })).toMatch(/own Admin role/);
    expect(checkAdminChange({ ...base, targetId: 1, newStatus: "disabled" })).toMatch(/disable your own/);
  });
  it("ignores changes that keep the admin active", () => {
    expect(checkAdminChange({ ...base, activeAdminCount: 1 })).toBeNull();
    expect(checkAdminChange({ ...base, targetRole: "engineer", newRole: "viewer", activeAdminCount: 1 })).toBeNull();
  });
});

describe("settings validation", () => {
  it("accepts the defaults for every section", () => {
    for (const [k, schema] of Object.entries(SETTINGS_SCHEMAS)) {
      expect(schema.safeParse(DEFAULT_SETTINGS[k as keyof typeof DEFAULT_SETTINGS]).success, k).toBe(true);
    }
  });
  it("rejects out-of-range detection values with field paths", () => {
    const r = SETTINGS_SCHEMAS.detection.safeParse({ ...DEFAULT_SETTINGS.detection, heartbeatTimeoutSec: 5, persistenceWindows: 0 });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toContain("heartbeatTimeoutSec");
    expect(paths).toContain("persistenceWindows");
  });
  it("rejects unknown keys, bad hosts, bad timezones and bad quiet hours", () => {
    expect(SETTINGS_SCHEMAS.detection.safeParse({ ...DEFAULT_SETTINGS.detection, hacker: 1 }).success).toBe(false);
    expect(SETTINGS_SCHEMAS.broker.safeParse({ ...DEFAULT_SETTINGS.broker, host: "evil host;rm" }).success).toBe(false);
    expect(SETTINGS_SCHEMAS.general.safeParse({ ...DEFAULT_SETTINGS.general, timezone: "Mars/Olympus" }).success).toBe(false);
    expect(SETTINGS_SCHEMAS.notifications.safeParse({ ...DEFAULT_SETTINGS.notifications, quietHours: { enabled: true, start: "25:00", end: "07:00" } }).success).toBe(false);
  });
  it("computes quiet hours across midnight", () => {
    const qh = { enabled: true, start: "22:00", end: "07:00" };
    expect(inQuietHours(qh, "UTC", new Date("2026-11-24T23:30:00Z"))).toBe(true);
    expect(inQuietHours(qh, "UTC", new Date("2026-11-24T06:59:00Z"))).toBe(true);
    expect(inQuietHours(qh, "UTC", new Date("2026-11-24T12:00:00Z"))).toBe(false);
    expect(inQuietHours({ ...qh, enabled: false }, "UTC", new Date("2026-11-24T23:30:00Z"))).toBe(false);
  });
});
