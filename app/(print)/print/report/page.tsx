"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/client/api";
import { decodeParams, describeFilters, ReportCharts, ReportSummary, ReportTable, type ReportData } from "@/components/app/report-view";
import { useMeQuery } from "@/components/app/context";
import { Logo } from "@/components/ui/icons";
import { fmtDateTime } from "@/lib/shared/format";
import type { MachineItem } from "@/lib/client/types";

/** Print-optimised report: logo, title, filters, charts and full table; A4 portrait; no sidebar. */
export default function PrintReportPage() {
  const sp = useSearchParams();
  const params = useMemo(() => decodeParams(sp.get("p") ?? ""), [sp]);
  const me = useMeQuery();
  const router = useRouter();
  const unauth = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (unauth) router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [unauth, router]);
  const branding = useQuery({ queryKey: ["branding"], queryFn: () => api<{ orgName: string; hasLogo: boolean }>("/api/public/branding") });
  const machines = useQuery({ queryKey: ["machines", "print"], queryFn: () => api<{ items: MachineItem[] }>("/api/machines?pageSize=200"), enabled: !!me.data });
  const q = useQuery({ queryKey: ["report-print", params], queryFn: () => api<ReportData>("/api/reports/preview", { body: { ...params, page: 1, pageSize: 5000 } }), enabled: !!params && !!me.data, retry: false });

  useEffect(() => {
    if (q.data && branding.data) {
      document.title = `${q.data.title} . ${branding.data.orgName}`;
      const t = setTimeout(() => window.print(), 700);
      return () => clearTimeout(t);
    }
  }, [q.data, branding.data]);

  if (unauth) return null;
  if (!params) return <p className="p-10 text-center">Invalid report link.</p>;
  if (q.error) return <p className="p-10 text-center text-danger">{(q.error as Error).message}</p>;
  if (!q.data || !me.data) return <p className="p-10 text-center text-muted">Preparing report...</p>;

  const d = q.data;
  const names = {
    sites: new Map(me.data.sites.map((s) => [s.id, s.name])),
    lines: new Map(me.data.sites.flatMap((s) => s.lines.map((l) => [l.id, `${s.name} . ${l.name}`] as [number, string]))),
    machines: new Map((machines.data?.items ?? []).map((m) => [m.id, m.name])),
  };
  return (
    <div className="mx-auto max-w-[190mm] bg-white px-2 py-6 text-ink">
      <div className="no-print mb-5 flex items-center justify-end gap-2">
        <button onClick={() => window.print()} className="h-9 rounded-[8px] bg-teal px-4 text-sm font-semibold text-white">
          Print / Save as PDF
        </button>
        <button onClick={() => window.close()} className="h-9 rounded-[8px] border border-line-strong px-4 text-sm font-semibold">
          Close
        </button>
      </div>
      <header className="flex items-center justify-between border-b-2 border-navy pb-3">
        {branding.data?.hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo served by the API
          <img src="/api/public/logo" alt={branding.data.orgName} className="h-10 max-w-[180px] object-contain" />
        ) : (
          <span className="rounded-md bg-navy px-2.5 py-1.5">
            <Logo />
          </span>
        )}
        <div className="text-right text-[11px] text-muted">
          <div className="font-semibold text-ink">{branding.data?.orgName}</div>
          <div>
            Generated {fmtDateTime(d.meta.generatedAt)} by {d.meta.generatedBy}
          </div>
        </div>
      </header>
      <h1 className="mt-5 text-2xl font-bold">{d.title}</h1>
      <p className="mt-1 text-[12px] text-muted">{describeFilters(params, names)}</p>
      {d.total === 0 ? (
        <p className="mt-10 text-center text-muted">No data for this selection.</p>
      ) : (
        <div className="mt-5 space-y-5">
          <ReportSummary data={d} />
          <ReportCharts data={d} print />
          <section className="print-break">
            <h2 className="mb-2 text-base font-bold">Data ({d.total} rows)</h2>
            <div className="overflow-hidden rounded-[8px] border border-line text-[12px]">
              <ReportTable data={d} />
            </div>
          </section>
        </div>
      )}
      <footer className="mt-8 border-t border-line pt-2 text-[10.5px] text-muted">Acoustic Sense . edge-ML acoustic health monitoring . raw audio never leaves the node</footer>
    </div>
  );
}
