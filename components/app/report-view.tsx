"use client";

import { cx, StatusPill } from "@/components/ui/basic";
import { SimpleBarChart, SimpleLineChart } from "@/components/ui/charts";
import { Table } from "@/components/ui/data";
import { fmtDateTime, fmtScore } from "@/lib/shared/format";

export interface ReportParamsClient {
  type: "alerts" | "health" | "downtime" | "availability";
  from: string;
  to: string;
  siteIds: number[];
  lines: number[];
  machineIds: number[];
  severities: string[];
  rangeLabel?: string;
}

export interface ReportData {
  title: string;
  summary: { label: string; value: string; tone?: string }[];
  charts: { id: string; title: string; kind: "bar" | "line" | "stacked"; xKey: string; data: Record<string, unknown>[]; series: { key: string; label: string; tone: string }[]; threshold?: number | null }[];
  columns: { key: string; label: string; type?: string }[];
  rows: Record<string, unknown>[];
  page: number;
  pageSize: number;
  total: number;
  meta: { generatedAt: string; generatedBy: string; params: ReportParamsClient };
}

export const REPORT_TYPES = [
  { value: "alerts", label: "Alert summary", body: "Counts by severity and status, top machines, mean time to acknowledge and resolve." },
  { value: "health", label: "Machine health", body: "Average and maximum anomaly score, time above threshold and events per machine." },
  { value: "downtime", label: "Downtime and maintenance", body: "Resolved alerts with action taken, downtime, parts used and who resolved." },
  { value: "availability", label: "Node availability", body: "Uptime per node, offline periods, synced events and firmware versions." },
] as const;

export function cell(type: string | undefined, v: unknown) {
  if (v === null || v === undefined || v === "") return <span className="text-muted">-</span>;
  switch (type) {
    case "datetime":
      return <span className="whitespace-nowrap tabular">{fmtDateTime(String(v))}</span>;
    case "score":
      return <span className="tabular">{fmtScore(Number(v))}</span>;
    case "percent":
      return <span className="tabular">{Number(v).toFixed(1)} %</span>;
    case "minutes":
    case "number":
      return <span className="tabular">{String(v)}</span>;
    case "severity":
    case "status":
      return <StatusPill status={String(v)} />;
    default:
      return <span className="whitespace-nowrap">{String(v)}</span>;
  }
}

const TONE_TEXT: Record<string, string> = { danger: "text-danger", warning: "text-warning-ink", success: "text-success", offline: "text-offline" };

export function ReportSummary({ data }: { data: ReportData }) {
  return (
    <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
      {data.summary.map((s) => (
        <div key={s.label} className="print-avoid rounded-[10px] border border-line bg-white px-4 py-3">
          <div className="text-[12px] font-medium text-muted">{s.label}</div>
          <div className={cx("mt-0.5 text-lg font-bold break-words tabular", s.tone ? TONE_TEXT[s.tone] : "text-ink")}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

export function ReportCharts({ data, print }: { data: ReportData; print?: boolean }) {
  return (
    <div className={cx("grid gap-4", print ? "grid-cols-1" : "grid-cols-2 max-xl:grid-cols-1")}>
      {data.charts.map((c) => (
        <div key={c.id} className="print-avoid rounded-[10px] border border-line bg-white p-4">
          <div className="mb-2 text-[13px] font-bold text-ink">{c.title}</div>
          {c.data.length === 0 ? (
            <div className="grid h-[200px] place-items-center text-sm text-muted">No data for this selection</div>
          ) : c.kind === "line" ? (
            <SimpleLineChart label={c.title} data={c.data} xKey={c.xKey} yKey={c.series[0].key} threshold={c.threshold} yFormat={(v) => v.toFixed(3)} height={220} />
          ) : (
            <SimpleBarChart data={c.data} xKey={c.xKey} series={c.series} stacked={c.kind === "stacked"} height={230} horizontalLabels={c.xKey === "d" && c.data.length <= 10} />
          )}
        </div>
      ))}
    </div>
  );
}

export function ReportTable({ data }: { data: ReportData }) {
  return (
    <Table
      rows={data.rows}
      rowKey={(r) => JSON.stringify(r).slice(0, 120) + String(r[data.columns[0].key])}
      dense
      columns={data.columns.map((c) => ({ key: c.key, header: c.label, align: ["number", "minutes", "score", "percent"].includes(c.type ?? "") ? ("right" as const) : undefined, render: (r: Record<string, unknown>) => cell(c.type, r[c.key]) }))}
    />
  );
}

export function describeFilters(p: ReportParamsClient, names: { sites: Map<number, string>; lines: Map<number, string>; machines: Map<number, string> }) {
  const parts = [
    `${fmtDateTime(p.from)} to ${fmtDateTime(p.to)}`,
    p.siteIds.length ? `Sites: ${p.siteIds.map((s) => names.sites.get(s) ?? s).join(", ")}` : "All accessible sites",
  ];
  if (p.lines.length) parts.push(`Lines: ${p.lines.map((l) => names.lines.get(l) ?? l).join(", ")}`);
  if (p.machineIds.length) parts.push(`Machines: ${p.machineIds.map((m) => names.machines.get(m) ?? m).join(", ")}`);
  if (p.severities.length) parts.push(`Severity: ${p.severities.join(", ")}`);
  return parts.join(" . ");
}

export function exportUrl(p: ReportParamsClient) {
  const sp = new URLSearchParams({
    type: p.type,
    from: p.from,
    to: p.to,
    siteIds: p.siteIds.join(","),
    lines: p.lines.join(","),
    machineIds: p.machineIds.join(","),
    severities: p.severities.join(","),
  });
  return `/api/reports/export.csv?${sp.toString()}`;
}

export function encodeParams(p: ReportParamsClient) {
  return encodeURIComponent(btoa(JSON.stringify(p)));
}
export function decodeParams(s: string): ReportParamsClient | null {
  try {
    return JSON.parse(atob(decodeURIComponent(s)));
  } catch {
    return null;
  }
}
