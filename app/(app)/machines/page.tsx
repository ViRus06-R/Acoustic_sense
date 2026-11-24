"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/use-url-state";
import { can, useApp } from "@/components/app/context";
import { usePageHeader } from "@/components/app/shell";
import { MachineCard } from "@/components/app/machine-card";
import { MachineFormModal } from "@/components/app/machine-form";
import { Button, Card, cx, Flash, scoreTone, StatusPill } from "@/components/ui/basic";
import { EmptyState, ErrorState, Pagination, Skeleton, Table, TableSkeleton } from "@/components/ui/data";
import { FilterSelect, SearchInput } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Sparkline } from "@/components/ui/charts";
import { fmtScore, relativeTime } from "@/lib/shared/format";
import { MACHINE_TYPES } from "@/lib/shared/domain";
import type { MachineItem } from "@/lib/client/types";

const DEFAULTS = { type: "All", status: "All", q: "", sort: "severity", view: "cards", page: "1" };

export default function MachinesPage() {
  const { me, siteParams } = useApp();
  const router = useRouter();
  const [f, setF] = useUrlState(DEFAULTS);
  const [adding, setAdding] = useState(false);
  const query = useQuery({
    queryKey: ["machines", siteParams, f.type, f.status, f.q, f.sort, f.page],
    queryFn: () =>
      api<{ items: MachineItem[]; total: number; page: number; pageSize: number; totals: { all: number; attention: number } }>(
        `/api/machines${qs({ ...siteParams, type: f.type === "All" ? null : f.type, status: f.status === "All" ? null : f.status, q: f.q, sort: f.sort, page: f.page })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const d = query.data;
  usePageHeader("Machines", d ? `${d.totals.all} machines . ${d.totals.attention} need attention` : "Loading machines...");
  const filtered = f.type !== "All" || f.status !== "All" || f.q !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput label="Search machines" placeholder="Search by machine or node ID" value={f.q} onChange={(v) => setF({ q: v })} className="w-64" />
        <FilterSelect label="Type" value={f.type} onChange={(v) => setF({ type: v })} options={[{ value: "All", label: "All types" }, ...MACHINE_TYPES.map((t) => ({ value: t, label: t }))]} />
        <FilterSelect
          label="Status"
          value={f.status}
          onChange={(v) => setF({ status: v })}
          options={["All", "Normal", "Warning", "Anomaly", "Offline"].map((s) => ({ value: s, label: s === "All" ? "All statuses" : s }))}
        />
        <FilterSelect
          label="Sort"
          value={f.sort}
          onChange={(v) => setF({ sort: v })}
          options={[
            { value: "severity", label: "Sort: Status severity" },
            { value: "score", label: "Sort: Score high to low" },
            { value: "name", label: "Sort: Name" },
            { value: "lastEvent", label: "Sort: Last event" },
          ]}
        />
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setF({ type: "All", status: "All", q: "" })}>
            Clear filters
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div role="group" aria-label="View" className="inline-flex rounded-[8px] border border-line-strong bg-white p-0.5">
            {(["cards", "table"] as const).map((v) => (
              <button
                key={v}
                aria-pressed={f.view === v}
                onClick={() => setF({ view: v }, { resetPage: false })}
                className={cx("flex h-8 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-semibold", f.view === v ? "bg-teal-soft text-teal-dark" : "text-muted hover:text-ink")}
              >
                <Icon name={v === "cards" ? "grid" : "list"} size={15} />
                {v === "cards" ? "Cards" : "Table"}
              </button>
            ))}
          </div>
          {can(me, "manage") && (
            <Button icon="plus" onClick={() => setAdding(true)}>
              Add machine
            </Button>
          )}
        </div>
      </div>

      {query.error ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Card>
      ) : !d ? (
        f.view === "cards" ? (
          <div className="grid grid-cols-4 gap-3 max-2xl:grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[126px] rounded-[10px]" />
            ))}
          </div>
        ) : (
          <Card bodyClassName="p-0">
            <TableSkeleton rows={8} cols={7} />
          </Card>
        )
      ) : d.items.length === 0 ? (
        <Card>
          <EmptyState
            title={filtered ? "No machines match your filters" : "No machines yet"}
            body={filtered ? "Try a different type, status or search term." : can(me, "manage") ? "Add your first machine to start monitoring." : "An administrator has not added machines for your sites yet."}
            action={
              filtered ? (
                <Button variant="secondary" onClick={() => setF({ type: "All", status: "All", q: "" })}>
                  Clear filters
                </Button>
              ) : can(me, "manage") ? (
                <Button icon="plus" onClick={() => setAdding(true)}>
                  Add machine
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : f.view === "cards" ? (
        <div>
          <div className="grid grid-cols-4 gap-3 max-2xl:grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1">
            {d.items.map((m) => (
              <MachineCard key={m.id} m={m} />
            ))}
          </div>
          <Card className="mt-4" bodyClassName="p-0">
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} shown={d.items.length} onPage={(p) => setF({ page: String(p) })} />
          </Card>
        </div>
      ) : (
        <Card bodyClassName="p-0">
          <Table
            rows={d.items}
            rowKey={(m) => m.id}
            rowLabel={(m) => `Open ${m.name}`}
            onRowClick={(m) => router.push(`/machines/${m.id}`)}
            columns={[
              { key: "name", header: "Machine", render: (m) => <span className="font-semibold text-ink">{m.name}</span> },
              { key: "type", header: "Type", render: (m) => <span className="text-ink-2">{m.type}</span> },
              { key: "line", header: "Line", render: (m) => <span className="text-ink-2">{m.line ? m.line.name : m.site.name}</span> },
              {
                key: "node",
                header: "Node",
                render: (m) =>
                  m.node ? (
                    <Link href={`/nodes/${m.node.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[13px] font-semibold text-teal hover:underline">
                      {m.node.id}
                    </Link>
                  ) : (
                    <span className="text-muted">-</span>
                  ),
              },
              { key: "status", header: "Status", render: (m) => <StatusPill status={m.status} /> },
              {
                key: "score",
                header: "Score",
                align: "right",
                render: (m) =>
                  m.status === "Offline" ? (
                    <span className="text-xs text-offline-ink">
                      Last seen {relativeTime(m.node?.lastHeartbeatAt)} . Node {m.node?.id ?? "none"}
                    </span>
                  ) : (
                    <Flash value={m.score} className={cx("font-bold tabular", scoreTone(m.status))}>
                      {fmtScore(m.score)}
                    </Flash>
                  ),
              },
              { key: "thr", header: "Threshold", align: "right", render: (m) => <span className="text-ink-2 tabular">{fmtScore(m.threshold)}</span> },
              { key: "last", header: "Last event", render: (m) => <span className="text-ink-2">{m.lastEventAt ? relativeTime(m.lastEventAt) : "-"}</span> },
              {
                key: "spark",
                header: "24 h",
                className: "w-[140px]",
                render: (m) => <Sparkline values={m.sparkline} threshold={m.threshold} tone={m.status === "Anomaly" ? "danger" : m.status === "Warning" ? "warning" : m.status === "Offline" ? "offline" : "teal"} height={28} />,
              },
            ]}
          />
          <Pagination page={d.page} pageSize={d.pageSize} total={d.total} shown={d.items.length} onPage={(p) => setF({ page: String(p) })} />
        </Card>
      )}
      <MachineFormModal open={adding} onClose={() => setAdding(false)} onSaved={(id) => router.push(`/machines/${id}`)} />
    </div>
  );
}
