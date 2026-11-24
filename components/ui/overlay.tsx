"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, cx } from "./basic";
import { Icon } from "./icons";
import { Input } from "./form";

export function Modal({ open, onClose, title, children, footer, width = 560, description }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number; description?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement;
    const t = setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select, textarea, button:not([data-close])");
      first?.focus();
    }, 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      lastFocus.current?.focus?.();
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-navy/45 px-4 py-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title" className="w-full rounded-[12px] bg-white shadow-[var(--shadow-pop)]" style={{ maxWidth: width }}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 id="modal-title" className="text-lg font-bold text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          <button data-close onClick={onClose} aria-label="Close dialog" className="grid h-8 w-8 place-items-center rounded-[8px] text-muted hover:bg-page hover:text-ink">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog(props: Parameters<typeof ConfirmInner>[0]) {
  // Inner state (typed word) resets automatically because the inner dialog unmounts when closed.
  return props.open ? <ConfirmInner {...props} /> : null;
}

function ConfirmInner({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = "Confirm",
  destructive,
  typedWord,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  typedWord?: string;
  loading?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const blocked = !!typedWord && typed !== typedWord;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} disabled={blocked} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-ink-2">
        {children}
        {typedWord && <Input label={<>Type <span className="font-mono font-bold">{typedWord}</span> to confirm</>} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
      </div>
    </Modal>
  );
}

/** Small dropdown menu anchored to a trigger. Keyboard: Enter/Space opens, Esc closes. */
export function Menu({ trigger, items, align = "right", label }: { trigger: ReactNode; label: string; align?: "left" | "right"; items: ({ label: string; onClick: () => void; danger?: boolean; disabled?: boolean } | "sep")[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)} className="rounded-[8px]">
        {trigger}
      </button>
      {open && (
        <div role="menu" className={cx("absolute z-50 mt-1.5 min-w-[200px] rounded-[10px] border border-line bg-white py-1.5 shadow-[var(--shadow-pop)]", align === "right" ? "right-0" : "left-0")}>
          {items.map((it, i) =>
            it === "sep" ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={cx("block w-full px-3.5 py-2 text-left text-sm hover:bg-page disabled:opacity-50", it.danger ? "text-danger-dark" : "text-ink-2")}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
