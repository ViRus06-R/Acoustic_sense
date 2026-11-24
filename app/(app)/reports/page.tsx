"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/client/api";
import { useApp } from "@/components/app/context";
import { usePageHeader } from "@/components/app/shell";
import {
  describeFilters,
  encodeParams,
  exportUrl,
  REPORT_TYPES,
  ReportCharts,
  ReportSummary,
  ReportTable,
  type ReportData,
  type ReportParamsClient,
} from "@/components/app/report-view";
import { Button, Card, cx, InfoBox } from "@/components/ui/basic";
import { EmptyState, ErrorState, Pagination, Skeleton, Table } from "@/components/ui/data";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { fmtDateTime } from "@/lib/shared/format";
import type { MachineItem } from "@/lib/client/types";

type RangeKey = "7d" | "30d" | "month" | "custom";
const today = () => new Date().toISOString().slice(0, 10);

function computeRange(key: RangeKey, from: string, to: string): { from: string; to: string; label: string } | { error: string } {
  const now = new Date();
  if (key === "7d") return { from: new Date(now.getTime() - 7 * 86400_000).toISOString(), to: now.toISOString(), label: "Last 7 days" };
  if (key === "30d") return { from: new Date(now.getTime() - 30 * 86400_000).toISOString(), to: now.toISOString(), label: "Last 30 days" };
  if (key === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString(), label: "This month" };
  if (!from || !to) return { error: "Choose a start and an end date." };
  const f = new Date(`${from}T00:00:00`);
  const t = new Date(`${to}T00:00:00`);
  t.setDate(t.getDate() + 1);
  if (isNaN(f.getTime()) || isNaN(t.getTime())) return { error: "Enter valid dates." };
  if (f >= t) return { error: "The start date must be on or before the end date." };
  if (t.getTime() - f.getTime() > 366 * 86400_000) return { error: "The maximum range is 12 months." };
  if (f.getTime() > Date.now()) return { error: "The start date is in the future." };
  return { from: f.toISOString(), to: t.toISOString(), label: `${from} to ${to}` };
}

export default function ReportsPage() {
  const { me } = useApp();
  usePageHeader("Reports", "Generate summaries for maintenance reviews and audits");
  const qc = useQueryClient();
  const [type, setType] = useState<ReportParamsClient["type"]>("alerts");
  const [rangeKey, setRangeKey] = useState<RangeKey>("7d");
  const [from, setFrom] = useState(() => new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [siteId, setSiteId] = useState<string>("");
  const [lineId, setLineId] = useState<string>("");
  const [machineIds, setMachineIds] = useState<number[]>([]);
  const [severities, setSeverities] = useState<string[]>([]);
  const [params, setParams] = useState<ReportParamsClient | null>(null);
  const [page, setPage] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const savedFor = useRef<string | null>(null);

  const site = me.sites.find((s) => String(s.id) === siteId);
  const machines = useQuery({ queryKey: ["machines", "report-options"], queryFn: () => api<{ items: MachineItem[] }>("/api/machines?pageSize=200&sort=name") });
  const machineOpts = (machines.data?.items ?? []).filter((m) => (!siteId || String(m.site.id) === siteId) && (!lineId || String(m.line?.id) === lineId));
  const names = useMemo(
    () => ({
      sites: new Map(me.sites.map((s) => [s.id, s.name])),
      lines: new Map(me.sites.flatMap((s) => s.lines.map((l) => [l.id, `${s.name} . ${l.name}`] as [number, string]))),
      machines: new Map((machines.data?.items ?? []).map((m) => [m.id, m.name])),
    }),
    [me.sites, machines.data],
  );

  const preview = useQuery({
    queryKey: ["report", params, page],
    queryFn: () => api<ReportData>("/api/reports/preview", { body: { ...params, page, pageSize: 15 } }),
    enabled: !!params,
    retry: false,
  });
  const recent = useQuery({ queryKey: ["reports-recent"], queryFn: () => api<{ id: number; type: string; params: ReportParamsClient; rowCount: number; createdAt: string }[]>("/api/reports/recent") });
  const saveRecent = useMutation({
    mutationFn: (b: { params: ReportParamsClient; rowCount: number }) => api("/api/reports/recent", { body: b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports-recent"] }),
  });
  useEffect(() => {
    if (!preview.data || !params) return;
    const key = JSON.stringify(params);
    if (savedFor.current === key) return;
    savedFor.current = key;
    saveRecent.mutate({ params, rowCount: preview.data.total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.data, params]);

  function generate() {
    const r = computeRange(rangeKey, from, to);
    if ("error" in r) {
      setFormError(r.error);
      return;
    }
    setFormError(null);
    setPage(1);
    savedFor.current = null;
    setParams({
      type,
      from: r.from,
      to: r.to,
      rangeLabel: r.label,
      siteIds: siteId ? [Number(siteId)] : [],
      lines: lineId ? [Number(lineId)] : [],
      machineIds,
      severities: type === "alerts" || type === "downtime" ? severities : [],
    });
  }

  function reopen(p: ReportParamsClient) {
    // Re-open regenerates from the saved parameters (relative ranges are re-evaluated against now).
    setType(p.type);
    setSiteId(p.siteIds[0] ? String(p.siteIds[0]) : "");
    setLineId(p.lines[0] ? String(p.lines[0]) : "");
    setMachineIds(p.machineIds);
    setSeverities(p.severities);
    setPage(1);
    savedFor.current = null;
    const rel = p.rangeLabel === "Last 7 days" ? "7d" : p.rangeLabel === "Last 30 days" ? "30d" : p.rangeLabel === "This month" ? "month" : null;
    if (rel) {
      setRangeKey(rel);
      const r = computeRange(rel, "", "") as { from: string; to: string };
      setParams({ ...p, from: r.from, to: r.to });
    } else {
      setRangeKey("custom");
      setFrom(p.from.slice(0, 10));
      setTo(new Date(new Date(p.to).getTime() - 86400_000).toISOString().slice(0, 10));
      setParams(p);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const d = preview.data;
  const err = preview.error instanceof ApiError ? preview.error : null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[340px_minmax(0,1fr)] items-start gap-5 max-xl:grid-cols-1">
        <Card title="Report builder">
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              generate();
            }}
          >
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-ink-2">1. Report type</legend>
              <div className="space-y-2">
                {REPORT_TYPES.map((t) => (
                  <label key={t.value} className={cx("flex cursor-pointer gap-3 rounded-[10px] border p-3 transition-colors", type === t.value ? "border-teal bg-teal-soft/50 ring-1 ring-teal" : "border-line hover:border-line-strong")}>
                    <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="mt-0.5 accent-teal" />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{t.label}</span>
                      <span className="block text-xs text-muted">{t.body}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-[13px] font-semibold text-ink-2">2. Date range</legend>
              <Select value={rangeKey} onChange={(e) => setRangeKey(e.target.value as RangeKey)} aria-label="Date range">
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="month">This month</option>
                <option value="custom">Custom range</option>
              </Select>
              {rangeKey === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <Input label="From" type="date" value={from} max={today()} onChange={(e) => setFrom(e.target.value)} />
                  <Input label="To" type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} />
                </div>
              )}
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-[13px] font-semibold text-ink-2">3. Scope</legend>
              <Select label="Site" value={siteId} onChange={(e) => { setSiteId(e.target.value); setLineId(""); setMachineIds([]); }}>
                <option value="">All my sites</option>
                {me.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select label="Line" value={lineId} onChange={(e) => { setLineId(e.target.value); setMachineIds([]); }} disabled={!site?.lines.length}>
                <option value="">All lines</option>
                {(site?.lines ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <MultiCheck label="Machines" empty="All machines" options={machineOpts.map((m) => ({ value: m.id, label: m.name }))} value={machineIds} onChange={setMachineIds} />
              {(type === "alerts" || type === "downtime") && (
                <MultiCheck label="Severity" empty="All severities" options={["Anomaly", "Warning", "Offline"].map((s) => ({ value: s, label: s }))} value={severities} onChange={setSeverities} />
              )}
            </fieldset>
            {formError && (
              <InfoBox tone="danger" icon="alert">
                {formError}
              </InfoBox>
            )}
            <Button type="submit" className="w-full" icon="report" loading={preview.isFetching && page === 1}>
              Generate report
            </Button>
          </form>
        </Card>

        <Card
          title={d ? d.title : "Preview"}
          subtitle={d && params ? `${describeFilters(params, names)} . Generated ${fmtDateTime(d.meta.generatedAt)} by ${d.meta.generatedBy}` : "Generate a report to see the preview here."}
          actions={
            d && params ? (
              <>
                <a href={exportUrl(params)} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line-strong bg-white px-3 text-[13px] font-semibold text-ink-2 hover:bg-page">
                  <Icon name="download" size={15} /> Export CSV
                </a>
                <a href={`/print/report?p=${encodeParams(params)}`} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-teal bg-teal px-3 text-[13px] font-semibold text-white hover:bg-teal-dark">
                  <Icon name="print" size={15} /> Print / Save as PDF
                </a>
              </>
            ) : undefined
          }
        >
          {!params ? (
            <EmptyState title="No report yet" body="Choose a report type, date range and scope on the left, then press Generate report." icon="report" />
          ) : err && err.status === 400 ? (
            <InfoBox tone="danger" icon="alert">
              {err.message}
            </InfoBox>
          ) : preview.error ? (
            <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
          ) : !d ? (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
              <Skeleton className="h-56" />
              <Skeleton className="h-40" />
            </div>
          ) : d.total === 0 ? (
            <EmptyState title="No data for this selection" body="Try a longer date range or a wider scope." />
          ) : (
            <div className="space-y-5">
              <ReportSummary data={d} />
              <ReportCharts data={d} />
              <div className="overflow-hidden rounded-[10px] border border-line">
                <ReportTable data={d} />
                <Pagination page={d.page} pageSize={d.pageSize} total={d.total} shown={d.rows.length} onPage={setPage} />
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="Recent reports" subtitle="The last 20 reports you generated" bodyClassName="p-0">
        {recent.error ? (
          <ErrorState error={recent.error} onRetry={() => recent.refetch()} />
        ) : !recent.data ? (
          <div className="p-5">
            <Skeleton className="h-20" />
          </div>
        ) : recent.data.length === 0 ? (
          <EmptyState title="No reports generated yet" icon="report" />
        ) : (
          <Table
            rows={recent.data}
            rowKey={(r) => r.id}
            dense
            columns={[
              { key: "t", header: "Type", render: (r) => <span className="font-semibold text-ink">{REPORT_TYPES.find((x) => x.value === r.type)?.label ?? r.type}</span> },
              { key: "r", header: "Range", render: (r) => <span className="text-ink-2">{r.params.rangeLabel ?? `${fmtDateTime(r.params.from)} to ${fmtDateTime(r.params.to)}`}</span> },
              { key: "g", header: "Generated at", render: (r) => <span className="tabular">{fmtDateTime(r.createdAt)}</span> },
              { key: "n", header: "Rows", align: "right", render: (r) => <span className="tabular">{r.rowCount}</span> },
              {
                key: "a",
                header: "",
                align: "right",
                render: (r) => (
                  <Button size="sm" variant="secondary" onClick={() => reopen(r.params)}>
                    Re-open
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

function MultiCheck<T extends string | number>({ label, options, value, onChange, empty }: { label: string; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; empty: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const summary = value.length === 0 ? empty : value.length <= 2 ? options.filter((o) => value.includes(o.value)).map((o) => o.label).join(", ") : `${value.length} selected`;
  return (
    <div className="relative" ref={ref}>
      <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{label}</div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex h-10 w-full items-center justify-between rounded-[8px] border border-line-strong bg-white px-3 text-left text-sm text-ink outline-none focus:border-teal focus:ring-3 focus:ring-teal/20">
        <span className="truncate">{summary}</span>
        <Icon name="chevronDown" size={16} className="text-muted" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-[10px] border border-line bg-white p-2 shadow-[var(--shadow-pop)]">
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted">No options</div>
          ) : (
            <>
              {value.length > 0 && (
                <button type="button" className="mb-1 px-2 text-xs font-semibold text-teal hover:underline" onClick={() => onChange([])}>
                  Clear selection
                </button>
              )}
              {options.map((o) => (
                <div key={String(o.value)} className="rounded px-2 py-1.5 hover:bg-page">
                  <Checkbox label={o.label} checked={value.includes(o.value)} onChange={(c) => onChange(c ? [...value, o.value] : value.filter((x) => x !== o.value))} />
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
