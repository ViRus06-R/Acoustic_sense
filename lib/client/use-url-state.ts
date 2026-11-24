"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/** Filters kept in the URL query string, so views are shareable and survive refresh. */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = useMemo(() => {
    const out = { ...defaults } as Record<string, string>;
    for (const k of Object.keys(defaults)) {
      const v = sp.get(k);
      if (v !== null) out[k] = v;
    }
    return out as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
  const set = useCallback(
    (patch: Partial<T>, opts: { resetPage?: boolean } = { resetPage: true }) => {
      const next = new URLSearchParams(sp.toString());
      const merged = { ...state, ...patch } as Record<string, string>;
      if (opts.resetPage !== false && !("page" in patch) && "page" in defaults) merged.page = "1";
      for (const [k, v] of Object.entries(merged)) {
        if (v === undefined || v === null || v === "" || v === defaults[k]) next.delete(k);
        else next.set(k, v);
      }
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [sp, state, defaults, router, pathname],
  );
  return [state, set] as const;
}
