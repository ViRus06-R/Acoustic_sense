"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import type { Me } from "./context";
import { Avatar, RoleChip } from "@/components/ui/basic";
import { Icon } from "@/components/ui/icons";
import { ROLE_CHIP } from "@/lib/shared/domain";

export function AccountMenu({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();
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

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    qc.clear();
    router.replace("/login?signedout=1");
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2.5 rounded-[8px] py-1 pr-1.5 pl-1 hover:bg-page">
        <Avatar name={me.name} size={34} />
        <span className="text-left max-md:hidden">
          <span className="block text-[13px] leading-4 font-semibold text-ink">{me.name}</span>
          <span className="block text-[11.5px] leading-4 text-muted">{ROLE_CHIP[me.role]}</span>
        </span>
        <Icon name="chevronDown" size={15} className="text-muted max-md:hidden" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-[260px] rounded-[12px] border border-line bg-white py-2 shadow-[var(--shadow-pop)]">
          <div className="border-b border-line px-4 pt-1 pb-3">
            <div className="text-sm font-semibold text-ink">{me.name}</div>
            <div className="truncate text-[12.5px] text-muted">{me.email}</div>
            <div className="mt-2">
              <RoleChip role={me.role} />
            </div>
          </div>
          {[
            { label: "My profile", icon: "user" as const, go: () => router.push("/profile") },
            { label: "Change password", icon: "key" as const, go: () => router.push("/profile/password") },
          ].map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.go();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-ink-2 hover:bg-page"
            >
              <Icon name={it.icon} size={16} className="text-muted" /> {it.label}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" onClick={signOut} className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-danger-dark hover:bg-page">
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
