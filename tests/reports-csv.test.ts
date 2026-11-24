import { describe, expect, it } from "vitest";
import { meanTimeToAcknowledge, meanTimeToResolve, formatMinutes } from "@/lib/shared/stats";
import { BOM, csvEscape, csvRow, isoInTimeZone, toCsv } from "@/lib/shared/csv";

describe("mean time to acknowledge / resolve", () => {
  const t0 = "2026-11-01T10:00:00Z";
  const alerts = [
    { detectedAt: t0, acknowledgedAt: "2026-11-01T10:10:00Z", resolvedAt: "2026-11-01T11:00:00Z" }, // 10 / 60
    { detectedAt: t0, acknowledgedAt: "2026-11-01T10:20:00Z", resolvedAt: "2026-11-01T12:00:00Z" }, // 20 / 120
    { detectedAt: t0, acknowledgedAt: null, resolvedAt: null }, // ignored
  ];
  it("averages only acknowledged alerts", () => {
    expect(meanTimeToAcknowledge(alerts)).toBe(15);
  });
  it("averages only resolved alerts", () => {
    expect(meanTimeToResolve(alerts)).toBe(90);
  });
  it("returns null when nothing qualifies", () => {
    expect(meanTimeToAcknowledge([{ detectedAt: t0 }])).toBeNull();
    expect(meanTimeToResolve([])).toBeNull();
  });
  it("ignores negative durations from clock skew", () => {
    expect(meanTimeToAcknowledge([{ detectedAt: t0, acknowledgedAt: "2026-11-01T09:59:00Z" }, { detectedAt: t0, acknowledgedAt: "2026-11-01T10:30:00Z" }])).toBe(30);
  });
  it("accepts Date objects and rounds to 2 decimals", () => {
    expect(meanTimeToResolve([{ detectedAt: new Date(t0), resolvedAt: new Date(Date.parse(t0) + 100_000) }])).toBe(1.67);
  });
  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(90)).toBe("1 h 30 min");
    expect(formatMinutes(null)).toBe("-");
  });
});

describe("CSV escaping", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvEscape("Pump, P-101")).toBe('"Pump, P-101"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
  it("leaves plain values and numbers alone, empties null", () => {
    expect(csvEscape("Bearing lubricated")).toBe("Bearing lubricated");
    expect(csvEscape(0.071)).toBe("0.071");
    expect(csvEscape(-61)).toBe("-61");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
  it("neutralises spreadsheet formulas", () => {
    expect(csvEscape("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
  });
  it("builds rows with CRLF and a UTF-8 BOM", () => {
    expect(csvRow(["a", "b,c", 1])).toBe('a,"b,c",1\r\n');
    const csv = toCsv(["Machine", "Score"], [["Pump P-101", 0.071]]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toBe(`${BOM}Machine,Score\r\nPump P-101,0.071\r\n`);
  });
  it("writes ISO timestamps in the site timezone (Asia/Karachi = +05:00)", () => {
    expect(isoInTimeZone("2026-11-24T05:42:07Z", "Asia/Karachi")).toBe("2026-11-24T10:42:07+05:00");
    expect(isoInTimeZone("2026-11-24T05:42:07Z", "UTC")).toBe("2026-11-24T05:42:07+00:00");
    expect(isoInTimeZone(null)).toBe("");
  });
});
