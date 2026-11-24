import { describe, expect, it } from "vitest";
import {
  classifySeverity,
  compareFirmware,
  DEFAULT_DETECTION,
  deliveredVia,
  deriveNodeStatus,
  filterMachinesByStatus,
  latestFirmware,
  nextNodeId,
  rssiBucket,
  sortMachines,
  type MachineStatus,
} from "@/lib/shared/domain";

const now = new Date("2026-11-24T10:00:00Z");
const fresh = new Date(now.getTime() - 5_000);
const cfg = DEFAULT_DETECTION; // persistence 9, warningRatio 0.85, rising 5, timeout 120 s

describe("severity rule (classifySeverity)", () => {
  const thr = 0.045;
  it("is Offline when there is no heartbeat within the timeout", () => {
    expect(classifySeverity({ scores: [0.01], threshold: thr, lastHeartbeatAt: new Date(now.getTime() - 121_000), now, cfg })).toBe("Offline");
    expect(classifySeverity({ scores: [0.01], threshold: thr, lastHeartbeatAt: null, now, cfg })).toBe("Offline");
  });
  it("is not Offline exactly at the timeout boundary", () => {
    expect(classifySeverity({ scores: [0.01], threshold: thr, lastHeartbeatAt: new Date(now.getTime() - 120_000), now, cfg })).toBe("Normal");
  });
  it("is Anomaly when above threshold for the configured number of consecutive windows", () => {
    const scores = [0.02, ...Array(9).fill(0.071)];
    expect(classifySeverity({ scores, threshold: thr, lastHeartbeatAt: fresh, now, cfg })).toBe("Anomaly");
  });
  it("is Warning when above threshold for fewer windows than the persistence", () => {
    const scores = [0.02, ...Array(8).fill(0.071)];
    expect(classifySeverity({ scores, threshold: thr, lastHeartbeatAt: fresh, now, cfg })).toBe("Warning");
  });
  it("resets the count when a window drops below threshold", () => {
    const scores = [...Array(8).fill(0.07), 0.02, 0.07];
    expect(classifySeverity({ scores, threshold: thr, lastHeartbeatAt: fresh, now, cfg })).toBe("Warning");
  });
  it("respects a per-node persistence override", () => {
    const scores = Array(3).fill(0.06);
    expect(classifySeverity({ scores, threshold: thr, lastHeartbeatAt: fresh, now, cfg: { ...cfg, persistenceWindows: 3 } })).toBe("Anomaly");
  });
  it("is Warning near the threshold (warning ratio)", () => {
    expect(classifySeverity({ scores: [0.02, 0.04], threshold: thr, lastHeartbeatAt: fresh, now, cfg })).toBe("Warning");
  });
  it("is Warning on a rising trend", () => {
    const scores = [0.02, 0.022, 0.025, 0.028, 0.031, 0.034];
    expect(classifySeverity({ scores, threshold: thr, lastHeartbeatAt: fresh, now, cfg })).toBe("Warning");
  });
  it("is Normal for a noisy baseline", () => {
    const scores = [0.02, 0.019, 0.021, 0.018, 0.02, 0.022, 0.019];
    expect(classifySeverity({ scores, threshold: thr, lastHeartbeatAt: fresh, now, cfg })).toBe("Normal");
  });
});

describe("machine status filter and severity sort", () => {
  const m = (name: string, status: MachineStatus, score: number | null, lastEventAt: string | null = null) => ({ name, status, score, lastEventAt });
  const list = [m("Pump P-102", "Normal", 0.02), m("Fan F-201", "Warning", 0.053), m("Pump P-101", "Anomaly", 0.071), m("Pump TX-P4", "Offline", null), m("Gearbox G-402", "Warning", 0.047)];

  it("filters by status, All returns everything", () => {
    expect(filterMachinesByStatus(list, "Warning").map((x) => x.name)).toEqual(["Fan F-201", "Gearbox G-402"]);
    expect(filterMachinesByStatus(list, "All")).toHaveLength(5);
    expect(filterMachinesByStatus(list, null)).toHaveLength(5);
    expect(filterMachinesByStatus(list, "Anomaly")).toHaveLength(1);
  });
  it("sorts by status severity: Anomaly, Warning, Offline, Normal, then score", () => {
    expect(sortMachines(list, "severity").map((x) => x.name)).toEqual(["Pump P-101", "Fan F-201", "Gearbox G-402", "Pump TX-P4", "Pump P-102"]);
  });
  it("sorts by score high to low with nulls last", () => {
    expect(sortMachines(list, "score").map((x) => x.score)).toEqual([0.071, 0.053, 0.047, 0.02, null]);
  });
  it("sorts by name naturally and does not mutate the input", () => {
    const names = ["Pump P-10", "Pump P-9", "Fan F-1"].map((n) => m(n, "Normal", 0.01));
    expect(sortMachines(names, "name").map((x) => x.name)).toEqual(["Fan F-1", "Pump P-9", "Pump P-10"]);
    expect(names[0].name).toBe("Pump P-10");
  });
});

describe("node status derivation and RSSI bucketing", () => {
  it("buckets RSSI: excellent > -55, good -55..-67, fair -67..-80, weak < -80", () => {
    expect(rssiBucket(-45)).toBe("excellent");
    expect(rssiBucket(-54)).toBe("excellent");
    expect(rssiBucket(-55)).toBe("good");
    expect(rssiBucket(-67)).toBe("good");
    expect(rssiBucket(-68)).toBe("fair");
    expect(rssiBucket(-80)).toBe("fair");
    expect(rssiBucket(-81)).toBe("weak");
    expect(rssiBucket(null)).toBe("weak");
  });
  it("derives Online / Offline / Degraded", () => {
    const base = { heartbeatTimeoutSec: 120, now };
    expect(deriveNodeStatus({ ...base, lastHeartbeatAt: fresh, rssi: -60, pending: 0 })).toBe("Online");
    expect(deriveNodeStatus({ ...base, lastHeartbeatAt: new Date(now.getTime() - 200_000), rssi: -60, pending: 0 })).toBe("Offline");
    expect(deriveNodeStatus({ ...base, lastHeartbeatAt: fresh, rssi: -85, pending: 0 })).toBe("Degraded");
    expect(deriveNodeStatus({ ...base, lastHeartbeatAt: fresh, rssi: -50, pending: 3 })).toBe("Degraded");
    expect(deriveNodeStatus({ ...base, lastHeartbeatAt: null, rssi: -50, pending: 0 })).toBe("Offline");
  });
  it("a longer heartbeat timeout keeps a node Online", () => {
    const hb = new Date(now.getTime() - 200_000);
    expect(deriveNodeStatus({ lastHeartbeatAt: hb, rssi: -50, pending: 0, heartbeatTimeoutSec: 300, now })).toBe("Online");
  });
});

describe("firmware, delivery and IDs", () => {
  it("compares firmware versions numerically", () => {
    expect(compareFirmware("v1.10.0", "v1.9.9")).toBeGreaterThan(0);
    expect(compareFirmware("v1.1.4", "v1.2.0")).toBeLessThan(0);
    expect(latestFirmware(["v1.1.3", "v1.2.0", "v1.1.4"])).toBe("v1.2.0");
  });
  it("labels late messages as Offline log sync", () => {
    const t = new Date("2026-11-24T10:00:00Z");
    expect(deliveredVia(t, new Date(t.getTime() + 2_000))).toBe("MQTT live");
    expect(deliveredVia(t, new Date(t.getTime() + 120_000))).toBe("Offline log sync");
  });
  it("suggests the next node ID", () => {
    expect(nextNodeId(["AS-N-001", "AS-N-024", "AS-N-007"])).toBe("AS-N-025");
    expect(nextNodeId([])).toBe("AS-N-001");
  });
});
