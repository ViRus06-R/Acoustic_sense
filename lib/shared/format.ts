export function fmtScore(x: number | null | undefined): string {
  return x == null || Number.isNaN(x) ? "-" : x.toFixed(3);
}

export function relativeTime(d: string | Date | null | undefined, now = Date.now()): string {
  if (!d) return "never";
  const t = typeof d === "string" ? Date.parse(d) : d.getTime();
  const s = Math.round((now - t) / 1000);
  if (s < 0) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function fmtDateTime(d: string | Date | null | undefined, tz = "Asia/Karachi"): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(d));
}

export function fmtDate(d: string | Date | null | undefined, tz = "Asia/Karachi"): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
}

export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return "-";
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min ${Math.round(sec % 60)} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
