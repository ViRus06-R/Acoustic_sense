"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "./basic";
import { Icon } from "./icons";
import { checkPasswordPolicy, passwordStrength, type PasswordPolicy } from "@/lib/shared/password";

const CTL =
  "w-full rounded-[8px] border bg-white px-3 text-sm text-ink placeholder:text-muted-2 outline-none transition focus:border-teal focus:ring-3 focus:ring-teal/20 disabled:bg-page disabled:text-muted";

export function Field({ label, error, hint, children, htmlFor, required, className }: { label?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string; required?: boolean; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink-2">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger-dark" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; error?: string; hint?: ReactNode; wrapClassName?: string };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, wrapClassName, className, id, required, ...rest }, ref) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={iid} required={required} className={wrapClassName}>
      <input
        ref={ref}
        id={iid}
        required={required}
        aria-invalid={!!error || undefined}
        className={cx(CTL, "h-10", error ? "border-danger" : "border-line-strong", className)}
        {...rest}
      />
    </Field>
  );
});

export function Select({ label, error, hint, wrapClassName, className, id, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; error?: string; hint?: ReactNode; wrapClassName?: string }) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={iid} className={wrapClassName}>
      <div className="relative">
        <select id={iid} aria-invalid={!!error || undefined} className={cx(CTL, "h-10 appearance-none pr-9", error ? "border-danger" : "border-line-strong", className)} {...rest}>
          {children}
        </select>
        <Icon name="chevronDown" size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
      </div>
    </Field>
  );
}

/** Compact select used in filter bars. */
export function FilterSelect({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <label className={cx("relative inline-flex", className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-[8px] border border-line-strong bg-white pr-8 pl-3 text-[13px] font-medium text-ink-2 outline-none focus:border-teal focus:ring-3 focus:ring-teal/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted" />
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <label className={cx("relative inline-flex", className)}>
      <span className="sr-only">{label}</span>
      <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-[8px] border border-line-strong bg-white pr-3 pl-9 text-[13px] outline-none placeholder:text-muted-2 focus:border-teal focus:ring-3 focus:ring-teal/20"
      />
    </label>
  );
}

export function Textarea({ label, error, hint, className, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; error?: string; hint?: ReactNode }) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={iid}>
      <textarea id={iid} aria-invalid={!!error || undefined} className={cx(CTL, "min-h-[76px] py-2", error ? "border-danger" : "border-line-strong", className)} {...rest} />
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, disabled, description }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; description?: ReactNode }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-2.5 text-sm text-ink-2", disabled && "cursor-not-allowed opacity-60")}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-teal" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", checked ? "bg-teal" : "bg-line-strong")}
    >
      <span className={cx("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

export function PasswordInput({ label, value, onChange, error, autoComplete, id }: { label: string; value: string; onChange: (v: string) => void; error?: string; autoComplete?: string; id?: string }) {
  const [show, setShow] = useState(false);
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} error={error} htmlFor={iid}>
      <div className="relative">
        <input
          id={iid}
          type={show ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error || undefined}
          className={cx(CTL, "h-11 pr-16", error ? "border-danger" : "border-line-strong")}
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-1 text-[13px] font-semibold text-teal hover:bg-teal-soft" aria-pressed={show} aria-label={show ? "Hide password" : "Show password"}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </Field>
  );
}

export function StrengthMeter({ password, policy }: { password: string; policy: PasswordPolicy }) {
  const s = passwordStrength(password);
  const rules = checkPasswordPolicy(password, policy).rules.filter((r) => r.id !== "max");
  const colors = ["bg-danger", "bg-danger", "bg-warning", "bg-teal", "bg-success"];
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cx("h-1.5 flex-1 rounded-full", password && i < Math.max(1, s.score) ? colors[s.score] : "bg-line")} />
          ))}
        </div>
        <span className="w-20 text-right text-xs font-semibold text-muted">{password ? s.label : ""}</span>
      </div>
      <ul className="space-y-1">
        {rules.map((r) => (
          <li key={r.id} className={cx("flex items-center gap-1.5 text-xs", r.ok ? "text-success-ink" : "text-muted")}>
            <Icon name={r.ok ? "check" : "x"} size={13} />
            <span>
              {r.label}
              <span className="sr-only">{r.ok ? " (met)" : " (not met)"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
