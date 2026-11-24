"use client";

import Link from "next/link";
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { initials } from "@/lib/shared/format";
import type { Role } from "@/lib/shared/domain";
import { ROLE_CHIP } from "@/lib/shared/domain";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ---------- Buttons ----------
type Variant = "primary" | "secondary" | "danger" | "ghost" | "link";
const VARIANT: Record<Variant, string> = {
  primary: "bg-teal text-white hover:bg-teal-dark border border-teal hover:border-teal-dark",
  secondary: "bg-white text-ink-2 border border-line-strong hover:bg-page",
  danger: "bg-danger text-white border border-danger hover:bg-danger-dark",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-page",
  link: "bg-transparent text-teal border-0 px-0 hover:underline h-auto",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; icon?: IconName; loading?: boolean }
>(function Button({ variant = "primary", size = "md", icon, loading, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-[8px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap",
        variant !== "link" && (size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm"),
        variant === "link" && "text-sm",
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-hidden="true" />;
}

// ---------- Card ----------
export function Card({ title, subtitle, actions, children, className, bodyClassName, id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section id={id} className={cx("rounded-[12px] border border-line bg-card shadow-[var(--shadow-card)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <div>
            {title && <h2 className="text-[15px] font-bold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("p-5", title || actions ? "pt-4" : "", bodyClassName)}>{children}</div>
    </section>
  );
}

// ---------- Status pills ----------
type Tone = "danger" | "warning" | "success" | "offline" | "teal" | "admin" | "info";
const TONE: Record<Tone, { bg: string; dot: string; text: string; border: string }> = {
  danger: { bg: "bg-danger-soft", dot: "bg-danger", text: "text-danger-dark", border: "border-danger/40" },
  warning: { bg: "bg-warning-soft", dot: "bg-warning", text: "text-warning-ink", border: "border-warning/50" },
  success: { bg: "bg-success-soft", dot: "bg-success", text: "text-success-ink", border: "border-success/40" },
  offline: { bg: "bg-offline-soft", dot: "bg-offline", text: "text-offline-ink", border: "border-offline/40" },
  teal: { bg: "bg-teal-soft", dot: "bg-teal", text: "text-teal-dark", border: "border-teal/40" },
  admin: { bg: "bg-admin-soft", dot: "bg-admin", text: "text-admin", border: "border-admin/40" },
  info: { bg: "bg-info-soft", dot: "bg-info-ink", text: "text-info-ink", border: "border-info-ink/30" },
};

export const STATUS_TONE: Record<string, Tone> = {
  Anomaly: "danger",
  Warning: "warning",
  Normal: "success",
  Healthy: "success",
  Online: "success",
  Resolved: "success",
  Active: "success",
  active: "success",
  Offline: "offline",
  Disabled: "offline",
  disabled: "offline",
  Degraded: "warning",
  Open: "danger",
  Acknowledged: "warning",
  Locked: "danger",
  Pending: "info",
};

export function Pill({ children, tone, outline, dot = true, className }: { children: ReactNode; tone: Tone; outline?: boolean; dot?: boolean; className?: string }) {
  const t = TONE[tone];
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold",
        outline ? cx("border bg-white", t.border) : t.bg,
        t.text,
        className,
      )}
    >
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Status pill: colour + text (never colour alone). */
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const outline = status === "Open" || status === "Acknowledged";
  return (
    <Pill tone={STATUS_TONE[status] ?? "offline"} outline={outline}>
      {label ?? (status === "active" ? "Active" : status === "disabled" ? "Disabled" : status)}
    </Pill>
  );
}

export function RoleChip({ role }: { role: Role }) {
  const tone: Tone = role === "admin" ? "admin" : role === "engineer" ? "success" : "offline";
  return (
    <Pill tone={tone} dot={false}>
      {ROLE_CHIP[role]}
    </Pill>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-teal font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

// ---------- Score colour ----------
export function scoreTone(status: string) {
  return status === "Anomaly" ? "text-danger" : status === "Warning" ? "text-warning-ink" : status === "Offline" ? "text-offline" : "text-success";
}

/** Briefly flashes when `value` changes (live updates). */
export function Flash({ value, children, className }: { value: unknown; children: ReactNode; className?: string }) {
  const prev = useRef(value);
  const [k, setK] = useState(0);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setK((x) => x + 1);
    }
  }, [value]);
  return (
    <span key={k} className={cx(k > 0 && "flash", className)}>
      {children}
    </span>
  );
}

// ---------- Page header ----------
export function PageActions({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center justify-end gap-2">{children}</div>;
}

export function InfoBox({ children, tone = "info", icon = "info" }: { children: ReactNode; tone?: "info" | "danger" | "warning" | "success"; icon?: IconName }) {
  const cls = {
    info: "bg-info-soft text-info-ink border-info-ink/15",
    danger: "bg-danger-soft text-danger-dark border-danger/25",
    warning: "bg-warning-soft text-warning-ink border-warning/30",
    success: "bg-success-soft text-success-ink border-success/25",
  }[tone];
  return (
    <div className={cx("flex gap-2.5 rounded-[8px] border px-3.5 py-3 text-[13px] leading-5", cls)} role={tone === "danger" ? "alert" : undefined}>
      <Icon name={icon} size={17} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx("font-semibold text-teal hover:underline", className)}>
      {children}
    </Link>
  );
}

export function KeyValue({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-2.5 text-sm">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-semibold text-ink tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function KpiCard({ label, value, tone, hint, active, onClick }: { label: string; value: ReactNode; tone?: "success" | "warning" | "danger" | "offline"; hint?: ReactNode; active?: boolean; onClick?: () => void }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : tone === "offline" ? "text-offline" : "text-ink";
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cx(
        "flex flex-col items-start justify-start rounded-[12px] border bg-card px-5 py-4 text-left shadow-[var(--shadow-card)]",
        active ? "border-teal ring-1 ring-teal" : "border-line",
        onClick && "hover:border-line-strong",
      )}
    >
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className={cx("mt-1 text-[28px] font-bold leading-9 tabular", color)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Comp>
  );
}
