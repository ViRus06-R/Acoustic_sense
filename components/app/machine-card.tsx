"use client";

import Link from "next/link";
import { cx, Flash, scoreTone, StatusPill } from "@/components/ui/basic";
import { Sparkline } from "@/components/ui/charts";
import { fmtScore, relativeTime } from "@/lib/shared/format";
import type { MachineItem } from "@/lib/client/types";

const SPARK_TONE: Record<string, string> = { Anomaly: "danger", Warning: "warning", Offline: "offline", Normal: "teal" };

export function MachineCard({ m }: { m: MachineItem }) {
  const offline = m.status === "Offline";
  return (
    <Link
      href={`/machines/${m.id}`}
      className={cx(
        "block rounded-[10px] border bg-white p-4 transition-shadow hover:shadow-[var(--shadow-pop)]",
        m.status === "Anomaly" ? "border-danger/40" : m.status === "Warning" ? "border-warning/45" : "border-line",
      )}
      aria-label={`${m.name}, ${m.status}${m.score != null && !offline ? `, score ${fmtScore(m.score)}` : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold text-ink">{m.name}</div>
          <div className="truncate text-[11.5px] text-muted">{m.line ? `${m.site.name} . ${m.line.name}` : m.site.name}</div>
        </div>
        <StatusPill status={m.status} />
      </div>
      {offline ? (
        <div className="mt-3">
          <div className="text-[22px] leading-8 font-bold text-offline tabular">-</div>
          <div className="text-[12px] text-offline-ink">
            Last seen {relativeTime(m.node?.lastHeartbeatAt)} . Node {m.node?.id ?? "none"}
          </div>
          <div className="mt-1.5 h-[34px] rounded bg-offline-soft/60" aria-hidden="true" />
        </div>
      ) : (
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <Flash value={m.score} className={cx("text-[24px] leading-8 font-bold tabular", scoreTone(m.status))}>
              {fmtScore(m.score)}
            </Flash>
            <div className="text-[11.5px] text-muted tabular">thr {fmtScore(m.threshold)}</div>
          </div>
          <div className="w-[55%]">
            <Sparkline values={m.sparkline} threshold={m.threshold} tone={SPARK_TONE[m.status]} />
          </div>
        </div>
      )}
    </Link>
  );
}
