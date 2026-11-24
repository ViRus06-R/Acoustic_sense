"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/use-url-state";
import { AdminOnly } from "@/components/app/admin-only";
import { usePageHeader } from "@/components/app/shell";
import { Button, Card, cx, InfoBox, KeyValue, Pill, StatusPill } from "@/components/ui/basic";
import { ErrorState, Skeleton, Table } from "@/components/ui/data";
import { Checkbox, Input, Select, Toggle } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { fmtDateTime, fmtDuration } from "@/lib/shared/format";
import { SETTINGS_SCHEMAS, type Settings, type SettingsKey } from "@/lib/shared/settings-schema";
import type { SiteItem } from "@/lib/client/types";

const TABS = [
  { id: "general", label: "General" },
  { id: "sites", label: "Sites and lines" },
  { id: "detection", label: "Detection" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
  { id: "broker", label: "MQTT and broker" },
  { id: "retention", label: "Data retention" },
] as const;
type TabId = (typeof TABS)[number]["id"];

interface SettingsResponse {
  settings: Settings;
  nodesUsingDefaults: number;
  updated: Record<string, { at: string; by: string | null }>;
}

export default function SettingsPage() {
  return (
    <AdminOnly>
      <SettingsInner />
    </AdminOnly>
  );
}

// Dirty-state registry so switching tabs or leaving the page warns about unsaved changes.
const dirtyTabs = new Set<string>();

function useUnsavedGuard(tab: string, dirty: boolean) {
  useEffect(() => {
    if (dirty) dirtyTabs.add(tab);
    else dirtyTabs.delete(tab);
    return () => {
      dirtyTabs.delete(tab);
    };
  }, [tab, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.href.includes("/api/")) return;
      if (!confirm("You have unsaved changes. Leave this page and discard them?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
}

function SettingsInner() {
  usePageHeader("Settings", "Organisation-wide configuration . changes apply immediately and are audited");
  const [{ tab }, setTab] = useUrlState({ tab: "general" });
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsResponse>("/api/settings") });
  const current = (TABS.find((t) => t.id === tab)?.id ?? "general") as TabId;

  const select = (id: TabId) => {
    if (dirtyTabs.size && !confirm("You have unsaved changes on this tab. Discard them?")) return;
    setTab({ tab: id }, { resetPage: false });
  };

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-5 max-lg:grid-cols-1">
      <nav aria-label="Settings sections" className="rounded-[12px] border border-line bg-white p-2 shadow-[var(--shadow-card)]">
        <ul role="tablist" aria-orientation="vertical" className="max-lg:flex max-lg:flex-wrap">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                role="tab"
                aria-selected={current === t.id}
                onClick={() => select(t.id)}
                className={cx("flex h-10 w-full items-center rounded-[8px] px-3 text-left text-[13.5px] font-medium", current === t.id ? "bg-teal-soft font-semibold text-teal-dark" : "text-ink-2 hover:bg-page")}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div role="tabpanel">
        {q.error ? (
          <Card>
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          </Card>
        ) : !q.data ? (
          <Card>
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          </Card>
        ) : current === "sites" ? (
          <SitesTab />
        ) : (
          <SectionTab key={current} section={current} data={q.data} />
        )}
      </div>
    </div>
  );
}

// ---------- Generic section form ----------
function useSection<K extends SettingsKey>(key: K, initial: Settings[K]) {
  const qc = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState<Settings[K]>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  useUnsavedGuard(key, dirty);
  const save = useMutation({
    mutationFn: () => api(`/api/settings/${key}`, { method: "PUT", body: value }),
    onSuccess: () => {
      setErrors({});
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["branding"] });
      toast({ tone: "success", title: "Settings saved", body: "Applied immediately and written to the audit log." });
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fields);
      toast({ tone: "error", title: "Could not save", body: (e as Error).message });
    },
  });
  const validateAndSave = () => {
    const r = SETTINGS_SCHEMAS[key].safeParse(value);
    if (!r.success) {
      const f: Record<string, string> = {};
      for (const i of r.error.issues) f[i.path.join(".")] ??= i.message;
      setErrors(f);
      return;
    }
    save.mutate();
  };
  return { value, setValue, errors, dirty, save: validateAndSave, saving: save.isPending, reset: () => setValue(initial) };
}

function SaveBar({ dirty, saving, onSave, onReset, updated }: { dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void; updated?: { at: string; by: string | null } }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <span className="text-xs text-muted">{dirty ? <span className="font-semibold text-warning-ink">Unsaved changes</span> : updated ? `Last changed ${fmtDateTime(updated.at)}${updated.by ? ` by ${updated.by}` : ""}` : "Using defaults"}</span>
      <div className="flex gap-2">
        {dirty && (
          <Button variant="secondary" onClick={onReset}>
            Discard
          </Button>
        )}
        <Button onClick={onSave} loading={saving} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

const num = (s: string) => (s === "" ? NaN : Number(s));

function SectionTab({ section, data }: { section: Exclude<TabId, "sites">; data: SettingsResponse }) {
  switch (section) {
    case "general":
      return <GeneralTab data={data} />;
    case "detection":
      return <DetectionTab data={data} />;
    case "notifications":
      return <NotificationsTab data={data} />;
    case "security":
      return <SecurityTab data={data} />;
    case "broker":
      return <BrokerTab data={data} />;
    case "retention":
      return <RetentionTab data={data} />;
  }
}

function GeneralTab({ data }: { data: SettingsResponse }) {
  const s = useSection("general", data.settings.general);
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoKey, setLogoKey] = useState(0);
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {
      return ["Asia/Karachi", "UTC"];
    }
  }, []);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api("/api/settings/logo", { form });
    },
    onSuccess: () => {
      setLogoKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["branding"] });
      toast({ tone: "success", title: "Logo uploaded", body: "Shown on print reports." });
    },
    onError: (e) => toast({ tone: "error", title: "Logo rejected", body: (e as Error).message }),
  });
  const remove = useMutation({
    mutationFn: () => api("/api/settings/logo", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast({ tone: "success", title: "Logo removed" });
    },
  });
  const v = s.value;
  return (
    <Card title="General" subtitle="Organisation identity and regional formats">
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Input label="Organisation name" value={v.orgName} onChange={(e) => s.setValue({ ...v, orgName: e.target.value })} error={s.errors.orgName} />
        <Select label="Default timezone" value={v.timezone} onChange={(e) => s.setValue({ ...v, timezone: e.target.value })} error={s.errors.timezone}>
          {zones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </Select>
        <Select label="Date / time format" value={v.dateFormat} onChange={(e) => s.setValue({ ...v, dateFormat: e.target.value as typeof v.dateFormat })}>
          <option>DD MMM YYYY, HH:mm</option>
          <option>YYYY-MM-DD HH:mm</option>
          <option>MM/DD/YYYY hh:mm a</option>
        </Select>
        <Select label="Language" value={v.language} disabled hint="English only for now">
          <option value="en">English</option>
        </Select>
      </div>
      <div className="mt-6 border-t border-line pt-5">
        <div className="mb-2 text-[13px] font-semibold text-ink-2">Logo</div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-16 w-40 place-items-center rounded-[8px] border border-dashed border-line-strong bg-page">
            {v.hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo served by the API
              <img key={logoKey} src={`/api/public/logo?v=${logoKey}`} alt="Current logo" className="max-h-12 max-w-36 object-contain" />
            ) : (
              <span className="text-xs text-muted">No logo</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/svg+xml"
            className="sr-only"
            id="logo-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 1024 * 1024) return toast({ tone: "error", title: "Logo too large", body: "Max 1 MB." });
              upload.mutate(f);
            }}
          />
          <Button variant="secondary" icon="upload" onClick={() => fileRef.current?.click()} loading={upload.isPending}>
            Upload PNG or SVG
          </Button>
          {v.hasLogo && (
            <Button variant="ghost" onClick={() => remove.mutate()}>
              Remove
            </Button>
          )}
          <span className="text-xs text-muted">Max 1 MB. Shown on print reports.</span>
        </div>
      </div>
      <SaveBar dirty={s.dirty} saving={s.saving} onSave={s.save} onReset={s.reset} updated={data.updated.general} />
    </Card>
  );
}

function NumberField({ label, value, onChange, error, hint, step, suffix }: { label: string; value: number; onChange: (n: number) => void; error?: string; hint?: ReactNode; step?: string; suffix?: string }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : "");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep text in sync when the value is reset
    if (num(text) !== value) setText(Number.isFinite(value) ? String(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      label={suffix ? `${label} (${suffix})` : label}
      type="number"
      step={step ?? "1"}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(num(e.target.value));
      }}
      error={error}
      hint={hint}
      className="tabular"
    />
  );
}

function DetectionTab({ data }: { data: SettingsResponse }) {
  const s = useSection("detection", data.settings.detection);
  const v = s.value;
  const e = s.errors;
  return (
    <Card title="Detection defaults" subtitle="Used by the ingestion pipeline and the shared severity rule">
      <div className="mb-5">
        <InfoBox>
          Per-node values on the Node page override these defaults. Changing defaults does not rewrite existing node values. <b>{data.nodesUsingDefaults}</b> node{data.nodesUsingDefaults === 1 ? " uses" : "s use"} the default persistence.
        </InfoBox>
      </div>
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Select label="Default threshold method" value={v.thresholdMethod} onChange={(x) => s.setValue({ ...v, thresholdMethod: x.target.value as typeof v.thresholdMethod })}>
          <option value="meanKStd">Mean + k x std (of baseline scores)</option>
          <option value="percentile">Percentile of baseline scores</option>
        </Select>
        {v.thresholdMethod === "meanKStd" ? (
          <NumberField label="k" step="0.1" value={v.k} onChange={(n) => s.setValue({ ...v, k: n })} error={e.k} hint="Default 3" />
        ) : (
          <NumberField label="Percentile" step="0.1" value={v.percentile} onChange={(n) => s.setValue({ ...v, percentile: n })} error={e.percentile} hint="Default 99" />
        )}
        <NumberField label="Persistence windows before alert" value={v.persistenceWindows} onChange={(n) => s.setValue({ ...v, persistenceWindows: n })} error={e.persistenceWindows} hint="Consecutive windows above threshold = Anomaly. Default 9" />
        <NumberField label="Heartbeat timeout" suffix="s" value={v.heartbeatTimeoutSec} onChange={(n) => s.setValue({ ...v, heartbeatTimeoutSec: n })} error={e.heartbeatTimeoutSec} hint="No heartbeat for this long = Offline. Default 120" />
        <NumberField label="Warning: score above X times threshold" step="0.05" value={v.warningRatio} onChange={(n) => s.setValue({ ...v, warningRatio: n })} error={e.warningRatio} hint="e.g. 0.85 = warn at 85% of threshold" />
        <NumberField label="Warning: rising for N windows" value={v.risingWindows} onChange={(n) => s.setValue({ ...v, risingWindows: n })} error={e.risingWindows} hint="0 disables the rising-trend rule" />
        <NumberField label="Alert de-duplication window" suffix="min" value={v.dedupWindowMin} onChange={(n) => s.setValue({ ...v, dedupWindowMin: n })} error={e.dedupWindowMin} hint="Repeated detections within this window extend one alert" />
      </div>
      <SaveBar dirty={s.dirty} saving={s.saving} onSave={s.save} onReset={s.reset} updated={data.updated.detection} />
    </Card>
  );
}

function NotificationsTab({ data }: { data: SettingsResponse }) {
  const s = useSection("notifications", data.settings.notifications);
  const toast = useToast();
  const v = s.value;
  const test = useMutation({
    mutationFn: () => api<{ file: string }>("/api/settings/test-notification", { method: "POST" }),
    onSuccess: (r) => toast({ tone: "success", title: "Test email written to dev-mail/", body: r.file }),
    onError: (e) => toast({ tone: "error", title: "Test failed", body: (e as Error).message }),
  });
  const sev = ["Warning", "Anomaly", "Offline"] as const;
  const ch = [
    { k: "inApp", l: "In-app" },
    { k: "push", l: "Push" },
    { k: "email", l: "Email" },
  ] as const;
  return (
    <Card title="Notifications" subtitle="Which severities reach users on which channel. Each user's own preference also applies." actions={<Button variant="secondary" size="sm" icon="bell" onClick={() => test.mutate()} loading={test.isPending}>Send test notification</Button>}>
      <div className="overflow-hidden rounded-[10px] border border-line">
        <table className="w-full text-sm">
          <thead className="bg-page">
            <tr>
              <th scope="col" className="h-10 px-4 text-left text-[11.5px] font-semibold text-muted uppercase">
                Severity
              </th>
              {ch.map((c) => (
                <th key={c.k} scope="col" className="h-10 px-4 text-center text-[11.5px] font-semibold text-muted uppercase">
                  {c.l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sev.map((sv) => (
              <tr key={sv} className="border-t border-line">
                <th scope="row" className="h-12 px-4 text-left">
                  <StatusPill status={sv} />
                </th>
                {ch.map((c) => (
                  <td key={c.k} className="px-4 text-center">
                    <Toggle
                      label={`${sv} via ${c.l}`}
                      checked={v.matrix[sv][c.k]}
                      onChange={(on) => s.setValue({ ...v, matrix: { ...v.matrix, [sv]: { ...v.matrix[sv], [c.k]: on } } })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-6 max-md:grid-cols-1">
        <div className="space-y-3">
          <Checkbox label="Quiet hours" description="Push and email are held back; in-app notifications still appear." checked={v.quietHours.enabled} onChange={(on) => s.setValue({ ...v, quietHours: { ...v.quietHours, enabled: on } })} />
          {v.quietHours.enabled && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" type="time" value={v.quietHours.start} onChange={(e) => s.setValue({ ...v, quietHours: { ...v.quietHours, start: e.target.value } })} error={s.errors["quietHours.start"]} />
              <Input label="To" type="time" value={v.quietHours.end} onChange={(e) => s.setValue({ ...v, quietHours: { ...v.quietHours, end: e.target.value } })} error={s.errors["quietHours.end"]} />
            </div>
          )}
        </div>
        <div className="space-y-3">
          <Checkbox label="Escalation" description="If an Anomaly stays Open, notify the Admins." checked={v.escalation.enabled} onChange={(on) => s.setValue({ ...v, escalation: { ...v.escalation, enabled: on } })} />
          {v.escalation.enabled && <NumberField label="Escalate after" suffix="min" value={v.escalation.minutes} onChange={(n) => s.setValue({ ...v, escalation: { ...v.escalation, minutes: n } })} error={s.errors["escalation.minutes"]} />}
        </div>
      </div>
      <SaveBar dirty={s.dirty} saving={s.saving} onSave={s.save} onReset={s.reset} updated={data.updated.notifications} />
    </Card>
  );
}

function SecurityTab({ data }: { data: SettingsResponse }) {
  const s = useSection("security", data.settings.security);
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const v = s.value;
  const e = s.errors;
  const signout = useMutation({
    mutationFn: () => api<{ revoked: number }>("/api/settings/force-signout", { method: "POST" }),
    onSuccess: (r) => {
      setConfirmOpen(false);
      toast({ tone: "success", title: "All users signed out", body: `${r.revoked} session(s) revoked. Your session stays active.` });
    },
  });
  return (
    <Card title="Security" subtitle="Password policy, lockout and sessions">
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <NumberField label="Minimum password length" value={v.minLength} onChange={(n) => s.setValue({ ...v, minLength: n })} error={e.minLength} />
        <div className="flex flex-col justify-end gap-2 pb-1">
          <Checkbox label="Require a number" checked={v.requireNumber} onChange={(c) => s.setValue({ ...v, requireNumber: c })} />
          <Checkbox label="Require a symbol" checked={v.requireSymbol} onChange={(c) => s.setValue({ ...v, requireSymbol: c })} />
        </div>
        <NumberField label="Failed attempts before lock" value={v.lockoutAttempts} onChange={(n) => s.setValue({ ...v, lockoutAttempts: n })} error={e.lockoutAttempts} hint="Default 5" />
        <NumberField label="Lock duration" suffix="min" value={v.lockoutMinutes} onChange={(n) => s.setValue({ ...v, lockoutMinutes: n })} error={e.lockoutMinutes} />
        <NumberField label="Session timeout (idle)" suffix="min" value={v.sessionTimeoutMin} onChange={(n) => s.setValue({ ...v, sessionTimeoutMin: n })} error={e.sessionTimeoutMin} hint="Sessions without “Remember me” end after this much inactivity" />
        <NumberField label="One-time link expiry" suffix="hours" value={v.linkExpiryHours} onChange={(n) => s.setValue({ ...v, linkExpiryHours: n })} error={e.linkExpiryHours} hint="Default 24 h" />
      </div>
      <SaveBar dirty={s.dirty} saving={s.saving} onSave={s.save} onReset={s.reset} updated={data.updated.security} />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-danger/25 bg-danger-soft/40 p-4">
        <div>
          <div className="text-sm font-semibold text-ink">Force sign-out of all users</div>
          <div className="text-xs text-muted">Revokes every active session except yours. Users must sign in again.</div>
        </div>
        <Button variant="danger" onClick={() => setConfirmOpen(true)}>
          Force sign-out
        </Button>
      </div>
      <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => signout.mutate()} loading={signout.isPending} destructive title="Sign out all users?" confirmLabel="Sign out everyone">
        <p>Every user (except you) is signed out immediately on all devices.</p>
      </ConfirmDialog>
    </Card>
  );
}

function BrokerTab({ data }: { data: SettingsResponse }) {
  const s = useSection("broker", data.settings.broker);
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const v = s.value;
  const status = useQuery({
    queryKey: ["broker-status"],
    queryFn: () => api<{ status: string; uptimeSec: number; connectedNodes: number; messagesPerMin: number; lastError: string | null; host: string; port: number; tls: boolean }>("/api/settings/broker-status"),
    refetchInterval: 5000,
  });
  const test = useMutation({
    mutationFn: () => api<{ ok: boolean; ms: number; error?: string }>("/api/settings/broker-test", { body: { host: v.host, port: v.port, tls: v.tls } }),
    onSuccess: (r) => toast(r.ok ? { tone: "success", title: "Connection successful", body: `${v.host}:${v.port} answered in ${r.ms} ms` } : { tone: "error", title: "Connection failed", body: r.error }),
    onError: (e) => toast({ tone: "error", title: "Test failed", body: (e as Error).message }),
  });
  const connChanged = v.host !== data.settings.broker.host || v.port !== data.settings.broker.port || v.tls !== data.settings.broker.tls;
  const st = status.data;
  return (
    <Card title="MQTT and broker" subtitle="Live broker status and connection settings" actions={<Button variant="secondary" size="sm" icon="refresh" onClick={() => test.mutate()} loading={test.isPending}>Test connection</Button>}>
      <div className="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
        <div className="rounded-[10px] border border-line p-4">
          <div className="mb-1 text-[13px] font-bold text-ink">Live status</div>
          {!st ? (
            <Skeleton className="h-32" />
          ) : (
            <KeyValue
              rows={[
                ["Connection", <StatusPill key="c" status={st.status === "connected" ? "Online" : st.status === "reconnecting" ? "Warning" : "Offline"} label={st.status === "connected" ? "Connected" : st.status === "reconnecting" ? "Reconnecting" : "Disconnected"} />],
                ["Uptime", st.status === "connected" ? fmtDuration(st.uptimeSec) : "-"],
                ["Connected nodes", st.connectedNodes],
                ["Messages / min", st.messagesPerMin],
                ["TLS", st.tls ? <Pill key="t" tone="success">On</Pill> : <Pill key="t" tone="warning">Off (dev)</Pill>],
                ...(st.lastError ? ([["Last error", <span key="e" className="text-xs font-normal text-danger-dark">{st.lastError}</span>]] as [string, ReactNode][]) : []),
              ]}
            />
          )}
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Input label="Broker host" value={v.host} onChange={(e) => s.setValue({ ...v, host: e.target.value })} error={s.errors.host} />
            <NumberField label="Port" value={v.port} onChange={(n) => s.setValue({ ...v, port: n })} error={s.errors.port} />
          </div>
          <Checkbox label="Use TLS (mqtts)" description="Requires a TLS listener on the broker (see docs/broker.md)." checked={v.tls} onChange={(c) => s.setValue({ ...v, tls: c, port: c && v.port === 1883 ? 8883 : !c && v.port === 8883 ? 1883 : v.port })} />
          <Input label="Topic prefix" value={v.topicPrefix} onChange={(e) => s.setValue({ ...v, topicPrefix: e.target.value })} error={s.errors.topicPrefix} hint="Topics: {prefix}/{site}/{node}/alert and .../telemetry" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="QoS alerts" value={String(v.qosAlerts)} disabled />
            <Input label="QoS telemetry" value={String(v.qosTelemetry)} disabled />
          </div>
        </div>
      </div>
      <SaveBar dirty={s.dirty} saving={s.saving} onSave={() => (connChanged ? setConfirmOpen(true) : s.save())} onReset={s.reset} updated={data.updated.broker} />
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          s.save();
        }}
        title="Change broker connection?"
        confirmLabel="Save and reconnect"
      >
        <p>
          The backend disconnects from the current broker and reconnects to <b>{v.host}:{v.port}</b>
          {v.tls ? " over TLS" : ""} without a restart. Live updates pause briefly. Use “Test connection” first if unsure.
        </p>
      </ConfirmDialog>
    </Card>
  );
}

function RetentionTab({ data }: { data: SettingsResponse }) {
  const s = useSection("retention", data.settings.retention);
  const toast = useToast();
  const qc = useQueryClient();
  const [purgeOpen, setPurgeOpen] = useState(false);
  const v = s.value;
  const storage = useQuery({ queryKey: ["storage"], queryFn: () => api<{ tables: { table: string; rows: number; mb: number | null }[]; purgeableTelemetry: number; retentionDays: number }>("/api/settings/storage") });
  const purge = useMutation({
    mutationFn: () => api<{ deleted: number }>("/api/settings/purge", { body: { confirm: "PURGE" } }),
    onSuccess: (r) => {
      setPurgeOpen(false);
      qc.invalidateQueries({ queryKey: ["storage"] });
      toast({ tone: "success", title: "Telemetry purged", body: `${r.deleted} rows deleted.` });
    },
    onError: (e) => toast({ tone: "error", title: "Purge failed", body: (e as Error).message }),
  });
  const total = storage.data?.tables.reduce((a, t) => a + (t.mb ?? 0), 0) ?? 0;
  return (
    <Card title="Data retention" subtitle="How long raw telemetry is kept">
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <NumberField label="Telemetry retention" suffix="days" value={v.telemetryDays} onChange={(n) => s.setValue({ ...v, telemetryDays: n })} error={s.errors.telemetryDays} hint="Default 90" />
        <Select label="Alert retention" value={v.alertRetention} onChange={(e) => s.setValue({ ...v, alertRetention: e.target.value as typeof v.alertRetention })}>
          <option value="keep">Keep forever (default)</option>
          <option value="365">1 year</option>
          <option value="730">2 years</option>
          <option value="1825">5 years</option>
        </Select>
      </div>
      <SaveBar dirty={s.dirty} saving={s.saving} onSave={s.save} onReset={s.reset} updated={data.updated.retention} />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_280px] gap-5 max-lg:grid-cols-1">
        <div className="overflow-hidden rounded-[10px] border border-line">
          {!storage.data ? (
            <Skeleton className="m-4 h-28" />
          ) : (
            <Table
              rows={storage.data.tables}
              rowKey={(t) => t.table}
              dense
              columns={[
                { key: "t", header: "Table", render: (t) => <span className="font-mono text-[13px]">{t.table}</span> },
                { key: "r", header: "Rows", align: "right", render: (t) => <span className="tabular">{t.rows.toLocaleString()}</span> },
                { key: "m", header: "Approx. size", align: "right", render: (t) => <span className="tabular">{t.mb != null ? `${t.mb} MB` : "-"}</span> },
              ]}
            />
          )}
          {storage.data && <div className="border-t border-line px-5 py-2.5 text-xs text-muted">Total approx. {total.toFixed(1)} MB</div>}
        </div>
        <div className="space-y-3">
          <div className="rounded-[10px] border border-danger/25 bg-danger-soft/40 p-4">
            <div className="text-sm font-semibold text-ink">Purge old telemetry</div>
            <div className="mt-0.5 text-xs text-muted">
              Deletes telemetry older than {data.settings.retention.telemetryDays} days{storage.data ? ` (${storage.data.purgeableTelemetry.toLocaleString()} rows)` : ""}. Alerts are not affected.
            </div>
            <Button variant="danger" size="sm" className="mt-3" icon="trash" onClick={() => setPurgeOpen(true)}>
              Purge now
            </Button>
          </div>
          <a href="/api/alerts/export.csv?range=all" className="flex items-center gap-2 rounded-[10px] border border-line p-4 text-sm font-semibold text-ink-2 hover:bg-page">
            <Icon name="download" size={17} className="text-teal" /> Export all alerts as CSV backup
          </a>
        </div>
      </div>
      <ConfirmDialog open={purgeOpen} onClose={() => setPurgeOpen(false)} onConfirm={() => purge.mutate()} loading={purge.isPending} destructive title="Purge old telemetry?" confirmLabel="Purge telemetry" typedWord="PURGE">
        <p>This permanently deletes telemetry older than {data.settings.retention.telemetryDays} days. This cannot be undone.</p>
      </ConfirmDialog>
    </Card>
  );
}

// ---------- Sites and lines ----------
function SitesTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["sites", "admin"], queryFn: () => api<SiteItem[]>("/api/sites?archived=1") });
  const [edit, setEdit] = useState<{ kind: "site" | "line"; mode: "create" | "edit"; siteId?: number; id?: number; name: string; address?: string; timezone?: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sites"] });
    qc.invalidateQueries({ queryKey: ["me"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const e = edit!;
      if (e.kind === "site") {
        const body = { name: e.name, address: e.address ?? "", timezone: e.timezone || null };
        return e.mode === "create" ? api("/api/sites", { body }) : api(`/api/sites/${e.id}`, { method: "PATCH", body });
      }
      return e.mode === "create" ? api(`/api/sites/${e.siteId}/lines`, { body: { name: e.name } }) : api(`/api/lines/${e.id}`, { method: "PATCH", body: { name: e.name } });
    },
    onSuccess: () => {
      refresh();
      toast({ tone: "success", title: "Saved", body: edit?.name });
      setEdit(null);
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      toast({ tone: "error", title: "Could not save", body: (e as Error).message });
    },
  });
  const archive = useMutation({
    mutationFn: (x: { kind: "site" | "line"; id: number; archived: boolean }) => api(x.kind === "site" ? `/api/sites/${x.id}` : `/api/lines/${x.id}`, { method: "PATCH", body: { archived: x.archived } }),
    onSuccess: (_r, x) => {
      refresh();
      toast({ tone: "success", title: x.archived ? "Archived" : "Restored" });
    },
    onError: (e) => toast({ tone: "error", title: "Cannot archive", body: (e as Error).message }),
  });

  return (
    <Card title="Sites and lines" subtitle="Each site can override the default timezone" actions={<Button size="sm" icon="plus" onClick={() => { setFields({}); setEdit({ kind: "site", mode: "create", name: "", address: "", timezone: "" }); }}>Add site</Button>}>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-4">
          {q.data.map((s) => (
            <div key={s.id} className={cx("rounded-[10px] border border-line", s.archived && "opacity-60")}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-ink">
                    {s.name} {s.archived && <Pill tone="offline">Archived</Pill>}
                  </div>
                  <div className="text-xs text-muted">
                    {s.address || "No address"} . {s.timezone ?? "Default timezone"} . {s.activeMachines} active machine{s.activeMachines === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {!s.archived && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => { setFields({}); setEdit({ kind: "line", mode: "create", siteId: s.id, name: "" }); }}>
                        Add line
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setFields({}); setEdit({ kind: "site", mode: "edit", id: s.id, name: s.name, address: s.address, timezone: s.timezone ?? "" }); }}>
                        Edit
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    title={!s.archived && s.activeMachines ? `Active machines: ${s.activeMachineNames.join(", ")}` : undefined}
                    onClick={() => archive.mutate({ kind: "site", id: s.id, archived: !s.archived })}
                  >
                    {s.archived ? "Restore" : "Archive"}
                  </Button>
                </div>
              </div>
              {s.lines.length === 0 ? (
                <div className="px-4 py-3 text-[13px] text-muted">No lines. Machines are attached to the site directly.</div>
              ) : (
                <ul className="divide-y divide-line">
                  {s.lines.map((l) => (
                    <li key={l.id} className={cx("flex items-center justify-between px-4 py-2.5 text-sm", l.archived && "opacity-60")}>
                      <span>
                        <span className="font-medium text-ink">{l.name}</span> <span className="text-xs text-muted">. {l.machines} machine{l.machines === 1 ? "" : "s"}</span> {l.archived && <Pill tone="offline">Archived</Pill>}
                      </span>
                      <span className="flex gap-1.5">
                        {!l.archived && (
                          <Button size="sm" variant="ghost" onClick={() => { setFields({}); setEdit({ kind: "line", mode: "edit", id: l.id, name: l.name }); }}>
                            Rename
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => archive.mutate({ kind: "line", id: l.id, archived: !l.archived })}>
                          {l.archived ? "Restore" : "Archive"}
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit ? `${edit.mode === "create" ? "Add" : "Edit"} ${edit.kind}` : ""}
        width={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!edit?.name.trim()}>
              Save changes
            </Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            <Input label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} error={fields.name} />
            {edit.kind === "site" && (
              <>
                <Input label="Address note" value={edit.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} error={fields.address} />
                <Input label="Timezone override" placeholder="Empty = organisation default (e.g. Asia/Karachi)" value={edit.timezone ?? ""} onChange={(e) => setEdit({ ...edit, timezone: e.target.value })} error={fields.timezone} />
              </>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
