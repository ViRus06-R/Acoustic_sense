"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/client/api";
import { useApp } from "@/components/app/context";
import { usePageHeader } from "@/components/app/shell";
import { Avatar, Button, Card, KeyValue, Pill, RoleChip } from "@/components/ui/basic";
import { ErrorState, Skeleton, Table } from "@/components/ui/data";
import { Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { fmtDateTime, relativeTime } from "@/lib/shared/format";
import type { NotifyVia } from "@/lib/shared/domain";

interface Session {
  id: string;
  current: boolean;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  remember: boolean;
}

function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /curl/i.test(ua) ? "curl" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${b} on ${os}` : b;
}

export default function ProfilePage() {
  const { me } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  usePageHeader("My profile", "Your details, notification preference and active sessions");
  const [v, setV] = useState({ name: me.name, phone: me.phone ?? "", notifyVia: me.notifyVia });
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync after the profile reloads
    setV({ name: me.name, phone: me.phone ?? "", notifyVia: me.notifyVia });
  }, [me.name, me.phone, me.notifyVia]);
  const dirty = v.name !== me.name || v.phone !== (me.phone ?? "") || v.notifyVia !== me.notifyVia;
  const save = useMutation({
    mutationFn: () => api("/api/auth/profile", { method: "PATCH", body: v }),
    onSuccess: () => {
      setFields({});
      qc.invalidateQueries({ queryKey: ["me"] });
      toast({ tone: "success", title: "Profile updated" });
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast({ tone: "error", title: "Could not save", body: (e as Error).message });
    },
  });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<Session[]>("/api/auth/sessions") });
  const signOutOthers = useMutation({
    mutationFn: () => api("/api/auth/sessions", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast({ tone: "success", title: "Other sessions signed out" });
    },
  });

  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(300px,1fr)] items-start gap-5 max-xl:grid-cols-1">
      <Card title="Profile">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex items-center gap-4">
            <Avatar name={v.name || me.name} size={56} />
            <div>
              <div className="text-lg font-bold text-ink">{me.name}</div>
              <div className="text-sm text-muted">{me.email}</div>
              <div className="mt-1.5">
                <RoleChip role={me.role} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <Input label="Full name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={fields.name} />
            <Input label="Phone (optional)" type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} error={fields.phone} placeholder="+92 3xx xxxxxxx" />
            <Select label="Notification channel" value={v.notifyVia} onChange={(e) => setV({ ...v, notifyVia: e.target.value as NotifyVia })} hint="Used together with the organisation's severity rules.">
              <option>Push + email</option>
              <option>Push</option>
              <option>Email</option>
            </Select>
            <Input label="Email" value={me.email} disabled hint="Ask an administrator to change your email." />
          </div>
          <div className="flex items-center justify-between border-t border-line pt-4">
            <Link href="/profile/password" className="text-[13px] font-semibold text-teal hover:underline">
              Change password
            </Link>
            <Button type="submit" disabled={!dirty} loading={save.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>
      <div className="space-y-5">
        <Card title="Access">
          <KeyValue
            rows={[
              ["Role", <RoleChip key="r" role={me.role} />],
              ["Site access", me.role === "admin" ? "All sites" : me.sites.map((s) => s.name).join(", ") || "None"],
              ["Last login", me.lastLoginAt ? `${fmtDateTime(me.lastLoginAt)}` : "-"],
            ]}
          />
          <p className="mt-3 text-xs text-muted">Site access and role are managed by an administrator.</p>
        </Card>
        <Card
          title="Active sessions"
          bodyClassName="p-0"
          actions={
            <Button size="sm" variant="secondary" disabled={!sessions.data || sessions.data.length < 2} loading={signOutOthers.isPending} onClick={() => signOutOthers.mutate()}>
              Sign out other sessions
            </Button>
          }
        >
          {sessions.error ? (
            <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
          ) : !sessions.data ? (
            <div className="p-5">
              <Skeleton className="h-20" />
            </div>
          ) : (
            <Table
              rows={sessions.data}
              rowKey={(s) => s.id}
              dense
              columns={[
                {
                  key: "d",
                  header: "Device",
                  render: (s) => (
                    <span>
                      <span className="font-semibold text-ink">{device(s.userAgent)}</span> {s.current && <Pill tone="teal" dot={false}>This device</Pill>}
                      <span className="block text-xs text-muted">{s.ip ?? ""}{s.remember ? " . remembered" : ""}</span>
                    </span>
                  ),
                },
                { key: "l", header: "Last active", render: (s) => <span className="text-ink-2">{relativeTime(s.lastSeenAt)}</span> },
              ]}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
