"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePageHeader } from "./shell";
import { Icon } from "@/components/ui/icons";

function SystemCard({ code, title, body }: { code: string; title: string; body: string }) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-[12px] border border-line bg-white p-10 text-center shadow-[var(--shadow-card)]">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-page text-muted">
        <Icon name={code === "403" ? "lock" : "search"} size={22} />
      </div>
      <div className="text-xs font-bold tracking-[0.14em] text-muted">ERROR {code}</div>
      <h2 className="mt-1 text-xl font-bold text-ink">{title}</h2>
      <p className="mt-2 text-sm text-muted">{body}</p>
      <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-[8px] bg-teal px-5 text-sm font-semibold text-white hover:bg-teal-dark">
        Back to dashboard
      </Link>
    </div>
  );
}

export function ForbiddenView() {
  usePageHeader("Access denied");
  return <SystemCard code="403" title="You do not have access to this page" body="Your role does not include this area. Ask an administrator if you think you should have access." />;
}

export function NotFoundView({ what = "page" }: { what?: string }) {
  usePageHeader("Not found");
  useEffect(() => {
    document.title = "Not found . Acoustic Sense";
  }, []);
  return <SystemCard code="404" title={`This ${what} could not be found`} body="It may have been archived, moved, or the link is incorrect." />;
}
