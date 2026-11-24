"use client";

import { useSyncExternalStore } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtScore } from "@/lib/shared/format";

// Chart colours are read from the CSS design tokens (globals.css), never hard-coded here.
const TOKEN_NAMES = ["teal", "teal-soft", "danger", "warning", "success", "offline", "muted", "line", "ink", "admin"] as const;
type TokenName = (typeof TOKEN_NAMES)[number];
let cache: Record<TokenName, string> | null = null;
function readTokens(): Record<TokenName, string> {
  if (cache) return cache;
  const cs = getComputedStyle(document.documentElement);
  cache = Object.fromEntries(TOKEN_NAMES.map((n) => [n, cs.getPropertyValue(`--color-${n}`).trim() || "currentColor"])) as Record<TokenName, string>;
  return cache;
}
const EMPTY = Object.fromEntries(TOKEN_NAMES.map((n) => [n, "currentColor"])) as Record<TokenName, string>;
export function useTokens() {
  return useSyncExternalStore(
    () => () => {},
    () => readTokens(),
    () => EMPTY,
  );
}
export const toneToken = (tone: string): TokenName => (tone === "danger" ? "danger" : tone === "warning" ? "warning" : tone === "success" ? "success" : tone === "offline" ? "offline" : "teal");

const axis = { fontSize: 11, tickLine: false, axisLine: false } as const;

function timeTick(range: string) {
  return (v: string) => {
    const d = new Date(v);
    if (range === "7d" || range === "30d") return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  };
}

interface Pt {
  t: string;
  v: number;
  max?: number;
}

function AboveDot(props: { cx?: number; cy?: number; payload?: Pt; threshold: number; color: string }) {
  const { cx, cy, payload, threshold, color } = props;
  if (cx == null || cy == null || !payload || payload.v <= threshold) return null;
  return <circle cx={cx} cy={cy} r={3} fill={color} stroke="white" strokeWidth={1} />;
}

/** Teal line + pale area, dashed red threshold line with label, red dots above threshold. */
export function ScoreChart({ points, threshold, range = "24h", height = 260, label = "Anomaly score" }: { points: Pt[]; threshold: number | null; range?: string; height?: number; label?: string }) {
  const c = useTokens();
  const max = Math.max(threshold ?? 0, ...points.map((p) => p.v)) * 1.25 || 0.1;
  return (
    <div style={{ height }} role="img" aria-label={`${label} chart${threshold ? `, threshold ${fmtScore(threshold)}` : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.teal} stopOpacity={0.22} />
              <stop offset="100%" stopColor={c.teal} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.line} strokeDasharray="0" vertical={false} />
          <XAxis dataKey="t" tickFormatter={timeTick(range)} {...axis} tick={{ fill: c.muted, fontSize: 11 }} minTickGap={40} />
          <YAxis domain={[0, Number(max.toFixed(3))]} tickFormatter={(v: number) => v.toFixed(3)} {...axis} tick={{ fill: c.muted, fontSize: 11 }} width={48} />
          <Tooltip
            formatter={(v) => [fmtScore(Number(v)), "Score"]}
            labelFormatter={(l) => new Date(String(l)).toLocaleString("en-GB", { hour12: false })}
            contentStyle={{ borderRadius: 8, border: `1px solid ${c.line}`, fontSize: 12 }}
          />
          {threshold != null && (
            <ReferenceLine y={threshold} stroke={c.danger} strokeDasharray="6 4" strokeWidth={1.4} label={{ value: `threshold ${fmtScore(threshold)}`, position: "insideTopRight", fill: c.danger, fontSize: 11 }} />
          )}
          <Area
            type="monotone"
            dataKey="v"
            stroke={c.teal}
            strokeWidth={1.8}
            fill="url(#scoreFill)"
            isAnimationActive={false}
            dot={threshold != null ? (p: object) => <AboveDot key={JSON.stringify((p as { index?: number }).index)} {...(p as object)} threshold={threshold} color={c.danger} /> : false}
            activeDot={{ r: 3.5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({ values, threshold, tone = "teal", height = 34 }: { values: number[]; threshold?: number | null; tone?: string; height?: number }) {
  const c = useTokens();
  const data = values.map((v, i) => ({ i, v }));
  if (values.length < 2) return <div style={{ height }} className="flex items-center text-xs text-muted-2">No recent data</div>;
  const max = Math.max(threshold ?? 0, ...values) * 1.15;
  return (
    <div style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <YAxis hide domain={[0, max]} />
          {threshold != null && <ReferenceLine y={threshold} stroke={c.danger} strokeDasharray="3 3" strokeOpacity={0.6} />}
          <Line type="monotone" dataKey="v" stroke={c[toneToken(tone)]} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBarChart({ data, xKey, series, height = 230, stacked, horizontalLabels }: { data: Record<string, unknown>[]; xKey: string; series: { key: string; label: string; tone: string }[]; height?: number; stacked?: boolean; horizontalLabels?: boolean }) {
  const c = useTokens();
  return (
    <div style={{ height }} role="img" aria-label={`Bar chart: ${series.map((s) => s.label).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: horizontalLabels ? 0 : 24 }}>
          <CartesianGrid stroke={c.line} vertical={false} />
          <XAxis dataKey={xKey} {...axis} tick={{ fill: c.muted, fontSize: 10.5 }} interval={0} angle={horizontalLabels ? 0 : -30} textAnchor={horizontalLabels ? "middle" : "end"} height={horizontalLabels ? 24 : 50} />
          <YAxis {...axis} tick={{ fill: c.muted, fontSize: 11 }} width={40} allowDecimals={false} />
          <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${c.line}`, fontSize: 12 }} cursor={{ fill: c["teal-soft"] }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? "a" : undefined} fill={c[toneToken(s.tone)]} radius={stacked ? 0 : [4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleLineChart({ data, xKey, yKey, threshold, height = 230, yFormat, label }: { data: Record<string, unknown>[]; xKey: string; yKey: string; threshold?: number | null; height?: number; yFormat?: (v: number) => string; label: string }) {
  const c = useTokens();
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${yKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.teal} stopOpacity={0.2} />
              <stop offset="100%" stopColor={c.teal} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.line} vertical={false} />
          <XAxis dataKey={xKey} {...axis} tick={{ fill: c.muted, fontSize: 11 }} minTickGap={30} />
          <YAxis {...axis} tick={{ fill: c.muted, fontSize: 11 }} width={48} tickFormatter={yFormat} domain={["auto", "auto"]} />
          <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${c.line}`, fontSize: 12 }} formatter={(v) => (yFormat ? yFormat(Number(v)) : String(v))} />
          {threshold != null && <ReferenceLine y={threshold} stroke={c.danger} strokeDasharray="6 4" label={{ value: `threshold ${fmtScore(threshold)}`, position: "insideTopRight", fill: c.danger, fontSize: 11 }} />}
          <Area type="monotone" dataKey={yKey} stroke={c.teal} strokeWidth={1.8} fill={`url(#fill-${yKey})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Uptime timeline: green = online, grey = offline bands. */
export function UptimeTimeline({ points, range }: { points: { t: string; online: boolean }[]; range: string }) {
  if (!points.length) return null;
  const first = new Date(points[0].t);
  const last = new Date(points[points.length - 1].t);
  const fmt = timeTick(range);
  const bands: { online: boolean; n: number; t: string }[] = [];
  for (const p of points) {
    const b = bands[bands.length - 1];
    if (b && b.online === p.online) b.n++;
    else bands.push({ online: p.online, n: 1, t: p.t });
  }
  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-[6px] border border-line" role="img" aria-label={`Uptime timeline with ${bands.filter((b) => !b.online).length} offline period(s)`}>
        {bands.map((b, i) => (
          <div
            key={i}
            title={`${b.online ? "Online" : "Offline"} from ${new Date(b.t).toLocaleString("en-GB", { hour12: false })}`}
            className={b.online ? "bg-success/80" : "bg-offline/45 [background-image:repeating-linear-gradient(45deg,transparent_0_4px,rgb(255_255_255/0.35)_4px_8px)]"}
            style={{ flexGrow: b.n }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
        <span>{fmt(first.toISOString())}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-success/80" /> Online
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-offline/45" /> Offline
          </span>
        </span>
        <span>{fmt(last.toISOString())}</span>
      </div>
    </div>
  );
}
