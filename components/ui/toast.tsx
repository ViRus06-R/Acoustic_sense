"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { cx } from "./basic";

type ToastTone = "success" | "error" | "info" | "warning";
interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}

const Ctx = createContext<{ push: (t: Omit<Toast, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === "error" ? 7000 : 4500);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="no-print pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className="toast-in pointer-events-auto flex gap-3 rounded-[10px] border border-line bg-white p-3.5 shadow-[var(--shadow-pop)]">
            <span
              className={cx(
                "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full",
                t.tone === "success" && "bg-success-soft text-success",
                t.tone === "error" && "bg-danger-soft text-danger",
                t.tone === "warning" && "bg-warning-soft text-warning-ink",
                t.tone === "info" && "bg-teal-soft text-teal",
              )}
            >
              <Icon name={t.tone === "success" ? "check" : t.tone === "info" ? "bell" : "alert"} size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{t.title}</div>
              {t.body && <div className="mt-0.5 text-[13px] text-muted">{t.body}</div>}
              {t.action && (
                <button className="mt-1 text-[13px] font-semibold text-teal hover:underline" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>
                  {t.action.label}
                </button>
              )}
            </div>
            <button aria-label="Dismiss notification" className="h-6 w-6 shrink-0 rounded text-muted hover:bg-page" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={15} className="mx-auto" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c.push;
}
