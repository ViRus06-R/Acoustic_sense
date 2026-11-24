"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, qs } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/use-url-state";
import { useApp } from "@/components/app/context";
import { AdminOnly } from "@/components/app/admin-only";
import { usePageHeader } from "@/components/app/shell";
import { Avatar, Button, Card, InfoBox, Pill, RoleChip, StatusPill } from "@/components/ui/basic";
import { EmptyState, ErrorState, Pagination, Table, TableSkeleton } from "@/components/ui/data";
import { Checkbox, FilterSelect, Input, SearchInput, Select } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/shared/format";
import type { NotifyVia, Role } from "@/lib/shared/domain";
import type { SiteItem } from "@/lib/client/types";

interface UserRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  notifyVia: NotifyVia;
  status: "active" | "disabled";
  lastLoginAt: string | null;
  locked: boolean;
  lockedUntil: string | null;
  pendingSetup: boolean;
  siteIds: number[];
  siteNames: string[];
}

const DEFAULTS = { q: "", role: "All", status: "All", sort: "name", page: "1" };

export default function UsersPage() {
  return (
    <AdminOnly>
      <UsersInner />
    </AdminOnly>
  );
}

function UsersInner() {
  const { me } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useUrlState(DEFAULTS);
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "reset" | "disable" | "enable"; user: UserRow } | null>(null);
  usePageHeader("Users & roles", "Manage who can access which sites");

  const q = useQuery({
    queryKey: ["users", f],
    queryFn: () => api<{ items: UserRow[]; total: number; page: number; pageSize: number }>(`/api/users${qs({ q: f.q, role: f.role, status: f.status, sort: f.sort, page: f.page })}`),
    placeholderData: keepPreviousData,
  });
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => api<SiteItem[]>("/api/sites") });

  const action = useMutation({
    mutationFn: async (x: { kind: "reset" | "disable" | "enable" | "unlock"; user: UserRow }) => {
      if (x.kind === "reset") return api<{ devMail: string }>(`/api/users/${x.user.id}/reset`, { method: "POST" });
      if (x.kind === "unlock") return api(`/api/users/${x.user.id}/unlock`, { method: "POST" });
      return api(`/api/users/${x.user.id}`, { method: "PATCH", body: { status: x.kind === "disable" ? "disabled" : "active" } });
    },
    onSuccess: (r, x) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setConfirm(null);
      const msg = {
        reset: { title: "Password link sent", body: `${x.user.email} . ${(r as { devMail?: string })?.devMail ?? ""}` },
        disable: { title: `${x.user.name} disabled`, body: "Their sessions were revoked." },
        enable: { title: `${x.user.name} enabled` },
        unlock: { title: `${x.user.name} unlocked` },
      }[x.kind];
      toast({ tone: "success", ...msg });
    },
    onError: (e) => {
      setConfirm(null);
      toast({ tone: "error", title: "Action failed", body: (e as Error).message });
    },
  });

  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput label="Search users" placeholder="Search name or email" value={f.q} onChange={(v) => setF({ q: v })} className="w-64" />
        <FilterSelect label="Role" value={f.role} onChange={(v) => setF({ role: v })} options={[{ value: "All", label: "Role: All" }, { value: "admin", label: "Admin" }, { value: "engineer", label: "Engineer" }, { value: "viewer", label: "Viewer" }]} />
        <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ status: v })} options={["All", "Active", "Disabled", "Locked"].map((x) => ({ value: x, label: x === "All" ? "Status: All" : x }))} />
        <FilterSelect label="Sort" value={f.sort} onChange={(v) => setF({ sort: v })} options={[{ value: "name", label: "Sort: Name" }, { value: "lastLogin", label: "Sort: Last login" }]} />
        <Button icon="plus" className="ml-auto" onClick={() => setEditing("new")}>
          Add user
        </Button>
      </div>
      <Card bodyClassName="p-0">
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !d ? (
          <TableSkeleton rows={6} cols={6} />
        ) : d.items.length === 0 ? (
          <EmptyState title="No users match your filters" icon="users" action={<Button variant="secondary" onClick={() => setF({ q: "", role: "All", status: "All" })}>Clear filters</Button>} />
        ) : (
          <>
            <Table
              rows={d.items}
              rowKey={(u) => u.id}
              columns={[
                {
                  key: "name",
                  header: "Name",
                  render: (u) => (
                    <span className="flex items-center gap-2.5">
                      <Avatar name={u.name} size={30} />
                      <span>
                        <span className="block font-semibold text-ink">
                          {u.name}
                          {u.id === me.id && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
                        </span>
                        {u.pendingSetup && <span className="block text-[11.5px] text-info-ink">Invitation pending</span>}
                      </span>
                    </span>
                  ),
                },
                { key: "email", header: "Email", render: (u) => <span className="text-ink-2">{u.email}</span> },
                { key: "role", header: "Role", render: (u) => <RoleChip role={u.role} /> },
                { key: "sites", header: "Sites", render: (u) => <span className="text-[13px] text-ink-2">{u.role === "admin" ? "All sites" : u.siteNames.join(", ") || "-"}</span> },
                {
                  key: "status",
                  header: "Status",
                  render: (u) => (
                    <span className="flex flex-wrap gap-1.5">
                      <StatusPill status={u.status} />
                      {u.locked && <Pill tone="danger">Locked</Pill>}
                    </span>
                  ),
                },
                { key: "login", header: "Last login", render: (u) => <span className="text-[13px] text-ink-2">{u.lastLoginAt ? relativeTime(u.lastLoginAt) : "Never"}</span> },
                {
                  key: "act",
                  header: <span className="sr-only">Actions</span>,
                  align: "right",
                  render: (u) => (
                    <span className="flex justify-end gap-3 text-[13px] font-semibold">
                      <button className="text-teal hover:underline" onClick={() => setEditing(u)}>
                        Edit
                      </button>
                      <button className="text-teal hover:underline disabled:text-muted disabled:no-underline" disabled={u.status !== "active"} onClick={() => setConfirm({ kind: "reset", user: u })}>
                        Reset
                      </button>
                      {u.locked && (
                        <button className="text-teal hover:underline" onClick={() => action.mutate({ kind: "unlock", user: u })}>
                          Unlock
                        </button>
                      )}
                      {u.id !== me.id && (
                        <button className={u.status === "active" ? "text-danger-dark hover:underline" : "text-teal hover:underline"} onClick={() => setConfirm({ kind: u.status === "active" ? "disable" : "enable", user: u })}>
                          {u.status === "active" ? "Disable" : "Enable"}
                        </button>
                      )}
                    </span>
                  ),
                },
              ]}
            />
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} shown={d.items.length} onPage={(p) => setF({ page: String(p) })} />
          </>
        )}
      </Card>

      <UserModal open={!!editing} user={editing === "new" ? null : editing} sites={sites.data ?? []} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && action.mutate(confirm)}
        loading={action.isPending}
        destructive={confirm?.kind === "disable"}
        title={confirm?.kind === "reset" ? `Reset password for ${confirm.user.name}?` : confirm?.kind === "disable" ? `Disable ${confirm?.user.name}?` : `Enable ${confirm?.user.name}?`}
        confirmLabel={confirm?.kind === "reset" ? "Send reset link" : confirm?.kind === "disable" ? "Disable user" : "Enable user"}
      >
        {confirm?.kind === "reset" && <p>A new one-time password link is emailed to {confirm.user.email}. Any existing link stops working and the user is signed out everywhere.</p>}
        {confirm?.kind === "disable" && <p>{confirm.user.name} will not be able to sign in, and all their sessions are revoked immediately. History is kept.</p>}
        {confirm?.kind === "enable" && <p>{confirm.user.name} can sign in again with their existing password.</p>}
      </ConfirmDialog>
    </div>
  );
}

function UserModal({ open, user, sites, onClose }: { open: boolean; user: UserRow | null; sites: SiteItem[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useApp();
  const blank = { name: "", email: "", role: "engineer" as Role, notifyVia: "Push + email" as NotifyVia, siteIds: [] as number[] };
  const [v, setV] = useState(blank);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form when the dialog opens
    setV(user ? { name: user.name, email: user.email, role: user.role, notifyVia: user.notifyVia, siteIds: user.siteIds } : blank);
    setFields({});
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);
  const save = useMutation({
    mutationFn: () => (user ? api(`/api/users/${user.id}`, { method: "PATCH", body: { name: v.name, role: v.role, notifyVia: v.notifyVia, siteIds: v.siteIds } }) : api<{ devMail: string | null }>("/api/users", { body: v })),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      if (user?.id === me.id) qc.invalidateQueries({ queryKey: ["me"] });
      toast(user ? { tone: "success", title: "User updated", body: v.name } : { tone: "success", title: "User created", body: `Password link emailed to ${v.email}${(r as { devMail?: string })?.devMail ? ` (${(r as { devMail: string }).devMail})` : ""}` });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setFields(e.fields);
        setError(e.message);
      } else setError("Could not save the user.");
    },
  });
  const self = user?.id === me.id;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user ? `Edit ${user.name}` : "Add user"}
      width={600}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!v.name.trim() || !v.email.trim()}>
            {user ? "Save changes" : "Create user"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Input label="Full name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={fields.name} />
        <Input label="Email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={fields.email} disabled={!!user} hint={user ? "Email cannot be changed" : undefined} />
        <Select label="Role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })} error={fields.role} disabled={self} hint={self ? "You cannot change your own role" : undefined}>
          <option value="admin">Admin</option>
          <option value="engineer">Maintenance Engineer</option>
          <option value="viewer">Viewer</option>
        </Select>
        <Select label="Notify via" value={v.notifyVia} onChange={(e) => setV({ ...v, notifyVia: e.target.value as NotifyVia })}>
          <option>Push + email</option>
          <option>Push</option>
          <option>Email</option>
        </Select>
        <fieldset className="col-span-2 max-md:col-span-1">
          <legend className="mb-2 text-[13px] font-semibold text-ink-2">Site access</legend>
          {v.role === "admin" ? (
            <p className="text-[13px] text-muted">Admins can access all sites.</p>
          ) : (
            <div className="space-y-2">
              {sites.flatMap((s) => [
                <Checkbox key={s.id} label={s.lines.length ? `${s.name} (${s.lines.map((l) => l.name).join(", ")})` : s.name} checked={v.siteIds.includes(s.id)} onChange={(c) => setV({ ...v, siteIds: c ? [...v.siteIds, s.id] : v.siteIds.filter((x) => x !== s.id) })} />,
              ])}
              {fields.siteIds && <p className="text-xs font-medium text-danger-dark">{fields.siteIds}</p>}
            </div>
          )}
        </fieldset>
        {!user && (
          <div className="col-span-2 max-md:col-span-1">
            <InfoBox>A one-time password link is emailed; it expires in 24 hours.</InfoBox>
          </div>
        )}
        {error && !Object.keys(fields).length && (
          <div className="col-span-2 max-md:col-span-1">
            <InfoBox tone="danger" icon="alert">
              {error}
            </InfoBox>
          </div>
        )}
      </div>
    </Modal>
  );
}
