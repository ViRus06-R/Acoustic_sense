"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/use-url-state";
import { AdminOnly } from "@/components/app/admin-only";
import { usePageHeader } from "@/components/app/shell";
import { Card } from "@/components/ui/basic";
import { EmptyState, ErrorState, Pagination, Table, TableSkeleton } from "@/components/ui/data";
import { FilterSelect, SearchInput } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { fmtDateTime } from "@/lib/shared/format";

interface Row {
  id: number;
  at: string;
  userName: string;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
}
const DEFAULTS = { q: "", action: "All", user: "All", days: "30", page: "1" };

function detailText(d: Record<string, unknown> | null) {
  if (!d) return "";
  return Object.entries(d)
    .map(([k, v]) => {
      if (v && typeof v === "object" && "old" in (v as object) && "new" in (v as object)) {
        const c = v as { old: unknown; new: unknown };
        return `${k}: ${JSON.stringify(c.old)} -> ${JSON.stringify(c.new)}`;
      }
      return `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
    })
    .join("; ");
}

export default function AuditPage() {
  return (
    <AdminOnly>
      <AuditInner />
    </AdminOnly>
  );
}

function AuditInner() {
  usePageHeader("Audit log", "Every state-changing action: who, what, when and target");
  const [f, setF] = useUrlState(DEFAULTS);
  const q = useQuery({
    queryKey: ["audit", f],
    queryFn: () => api<{ items: Row[]; total: number; page: number; pageSize: number; users: string[]; actionGroups: string[] }>(`/api/audit${qs({ ...f, days: f.days === "all" ? null : f.days })}`),
    placeholderData: keepPreviousData,
  });
  const d = q.data;
  const exportQs = qs({ q: f.q, action: f.action, user: f.user, days: f.days === "all" ? null : f.days });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput label="Search audit log" placeholder="Search user, action or target" value={f.q} onChange={(v) => setF({ q: v })} className="w-72" />
        <FilterSelect label="Action" value={f.action} onChange={(v) => setF({ action: v })} options={[{ value: "All", label: "Action: All" }, ...(d?.actionGroups ?? []).map((a) => ({ value: a, label: a }))]} />
        <FilterSelect label="User" value={f.user} onChange={(v) => setF({ user: v })} options={[{ value: "All", label: "User: All" }, ...(d?.users ?? []).map((u) => ({ value: u, label: u }))]} />
        <FilterSelect label="Period" value={f.days} onChange={(v) => setF({ days: v })} options={[{ value: "1", label: "Last 24 hours" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "all", label: "All time" }]} />
        <a href={`/api/audit/export.csv${exportQs}`} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-line-strong bg-white px-3 text-[13px] font-semibold text-ink-2 hover:bg-page">
          <Icon name="download" size={15} /> Export CSV
        </a>
      </div>
      <Card bodyClassName="p-0">
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !d ? (
          <TableSkeleton rows={10} cols={5} />
        ) : d.items.length === 0 ? (
          <EmptyState title="No audit entries" body="Nothing matches these filters." icon="audit" />
        ) : (
          <>
            <Table
              rows={d.items}
              rowKey={(r) => r.id}
              dense
              columns={[
                { key: "at", header: "Time", render: (r) => <span className="whitespace-nowrap tabular">{fmtDateTime(r.at)}</span> },
                { key: "u", header: "User", render: (r) => <span className="font-semibold text-ink">{r.userName}</span> },
                { key: "a", header: "Action", render: (r) => <code className="rounded bg-page px-1.5 py-0.5 font-mono text-[12px] text-ink-2">{r.action}</code> },
                { key: "t", header: "Target", render: (r) => <span className="text-ink-2">{r.target ?? "-"}</span> },
                { key: "d", header: "Details", render: (r) => <span className="line-clamp-2 max-w-[460px] text-[12.5px] break-all text-muted" title={detailText(r.details)}>{detailText(r.details) || "-"}</span> },
              ]}
            />
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} shown={d.items.length} onPage={(p) => setF({ page: String(p) })} />
          </>
        )}
      </Card>
    </div>
  );
}
