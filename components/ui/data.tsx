"use client";

import type { ReactNode } from "react";
import { Button, cx } from "./basic";
import { Icon } from "./icons";
import { ApiError } from "@/lib/client/api";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-0" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-12 items-center gap-4 border-b border-line px-5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cx("h-3.5", c === 0 ? "w-40" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action, icon = "search" }: { title: string; body?: ReactNode; action?: ReactNode; icon?: Parameters<typeof Icon>[0]["name"] }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-page text-muted">
        <Icon name={icon} size={20} />
      </span>
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {body && <div className="mt-1 max-w-md text-[13px] text-muted">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof ApiError ? error.message : "Something went wrong while loading this data.";
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center" role="alert">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-danger-soft text-danger">
        <Icon name="alert" size={20} />
      </span>
      <div className="text-[15px] font-semibold text-ink">Could not load data</div>
      <div className="mt-1 max-w-md text-[13px] text-muted">{msg}</div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon="refresh" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export interface Col<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right";
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  rowLabel,
  dense,
}: {
  columns: Col<T>[];
  rows: T[];
  rowKey: (r: T) => string | number;
  onRowClick?: (r: T) => void;
  selectedKey?: string | number | null;
  rowLabel?: (r: T) => string;
  dense?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-page/80">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx("h-10 border-y border-line px-4 text-[11.5px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase first:pl-5 last:pr-5", c.align === "right" ? "text-right" : "text-left", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = rowKey(r);
            const selected = selectedKey != null && selectedKey === k;
            return (
              <tr
                key={k}
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick && rowLabel ? rowLabel(r) : undefined}
                aria-selected={onRowClick ? selected : undefined}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(r);
                        }
                      }
                    : undefined
                }
                className={cx(
                  "border-b border-line transition-colors last:border-b-0",
                  dense ? "h-11" : "h-12",
                  onRowClick && "cursor-pointer hover:bg-page/70 focus-visible:bg-teal-soft/60",
                  selected && "bg-teal-soft/70 shadow-[inset_3px_0_0_var(--color-teal)]",
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cx("px-4 py-2 first:pl-5 last:pr-5", c.align === "right" && "text-right", c.className)}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, shown, onPage }: { page: number; pageSize: number; total: number; shown: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const nums: (number | "...")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "...") nums.push("...");
  }
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-muted" aria-label="Pagination">
      <span className="tabular">
        Showing {shown} of {total}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button className="grid h-8 w-8 place-items-center rounded-[8px] hover:bg-page disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <Icon name="chevronLeft" size={16} />
          </button>
          {nums.map((n, i) =>
            n === "..." ? (
              <span key={`e${i}`} className="px-1">
                ...
              </span>
            ) : (
              <button
                key={n}
                onClick={() => onPage(n)}
                aria-current={n === page ? "page" : undefined}
                className={cx("h-8 min-w-8 rounded-[8px] px-2 font-semibold tabular", n === page ? "bg-teal-soft text-teal-dark" : "text-ink-2 hover:bg-page")}
              >
                {n}
              </button>
            ),
          )}
          <button className="grid h-8 w-8 place-items-center rounded-[8px] hover:bg-page disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      )}
    </nav>
  );
}

export function Tabs<T extends string>({ value, onChange, options, label, size = "sm" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; size?: "sm" | "md" }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex items-center gap-1 rounded-full border border-line bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("rounded-full font-semibold transition-colors", size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-3.5 text-[13px]", value === o.value ? "bg-teal-soft text-teal-dark" : "text-muted hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
