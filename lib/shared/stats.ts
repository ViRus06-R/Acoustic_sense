// Report calculations shared by the server and tests.

export interface AlertTimes {
  detectedAt: string | Date;
  acknowledgedAt?: string | Date | null;
  resolvedAt?: string | Date | null;
}

function ms(d: string | Date) {
  return typeof d === "string" ? Date.parse(d) : d.getTime();
}

/** Mean time to acknowledge in minutes; alerts never acknowledged are ignored. Null when none. */
export function meanTimeToAcknowledge(alerts: AlertTimes[]): number | null {
  const v = alerts
    .filter((a) => a.acknowledgedAt)
    .map((a) => (ms(a.acknowledgedAt!) - ms(a.detectedAt)) / 60000)
    .filter((x) => x >= 0);
  return v.length ? round2(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

/** Mean time to resolve in minutes (detected -> resolved). Null when none resolved. */
export function meanTimeToResolve(alerts: AlertTimes[]): number | null {
  const v = alerts
    .filter((a) => a.resolvedAt)
    .map((a) => (ms(a.resolvedAt!) - ms(a.detectedAt)) / 60000)
    .filter((x) => x >= 0);
  return v.length ? round2(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

export function round2(x: number) {
  return Math.round(x * 100) / 100;
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null) return "-";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
