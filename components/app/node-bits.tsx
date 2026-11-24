"use client";

import { useState } from "react";
import { Button, cx, InfoBox } from "@/components/ui/basic";
import { Modal } from "@/components/ui/overlay";
import { Icon } from "@/components/ui/icons";
import { rssiBucket, RSSI_BARS } from "@/lib/shared/domain";

const BUCKET_LABEL = { excellent: "Excellent", good: "Good", fair: "Fair", weak: "Weak" } as const;

export function RssiBars({ rssi }: { rssi: number | null }) {
  const b = rssiBucket(rssi);
  const bars = RSSI_BARS[b];
  const color = b === "weak" ? "bg-danger" : b === "fair" ? "bg-warning" : "bg-success";
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={`${BUCKET_LABEL[b]} signal`}>
      <span className="flex h-4 items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cx("w-[4px] rounded-sm", i <= bars ? color : "bg-line-strong")} style={{ height: `${i * 25}%` }} />
        ))}
      </span>
      <span className="text-ink-2 tabular">{rssi != null ? `${rssi} dBm` : "-"}</span>
      <span className="sr-only">({BUCKET_LABEL[b]})</span>
    </span>
  );
}

export function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 text-[12.5px] font-semibold text-ink-2">{label}</div>
      <div className="flex items-center gap-2 rounded-[8px] border border-line-strong bg-page px-3 py-2">
        <code className={cx("min-w-0 flex-1 text-[13px] break-all text-ink", mono && "font-mono")}>{value}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex shrink-0 items-center gap-1 rounded-[6px] px-2 py-1 text-[12.5px] font-semibold text-teal hover:bg-teal-soft"
          aria-label={`Copy ${label}`}
        >
          <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export interface Credentials {
  credentials: { username: string; password: string };
  topics: { alert: string; telemetry: string };
}

/** Shows a node's MQTT password exactly once. Only the hash is stored on the server. */
export function CredentialsDialog({ data, onClose, title }: { data: Credentials | null; onClose: () => void; title: string }) {
  const [ack, setAck] = useState(false);
  return (
    <Modal
      open={!!data}
      onClose={() => {
        if (ack || confirm("The password will not be shown again. Close anyway?")) {
          setAck(false);
          onClose();
        }
      }}
      title={title}
      width={560}
      footer={
        <Button
          onClick={() => {
            setAck(false);
            onClose();
          }}
          disabled={!ack}
        >
          I have stored the credentials
        </Button>
      }
    >
      {data && (
        <div className="space-y-4">
          <InfoBox tone="warning" icon="alert">
            <b>Copy the password now.</b> It is shown only once. The server stores only a hash; if it is lost, rotate the credentials.
          </InfoBox>
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <CopyField label="MQTT username" value={data.credentials.username} />
            <CopyField label="MQTT password" value={data.credentials.password} />
          </div>
          <CopyField label="Alert topic (publish, QoS 1)" value={data.topics.alert} />
          <CopyField label="Telemetry topic (publish, QoS 0)" value={data.topics.telemetry} />
          <p className="text-xs text-muted">After registering, run <code className="font-mono">npm run broker:sync-users</code> to update the Mosquitto password and ACL files. Each node may publish only to its own two topics.</p>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className="h-4 w-4 accent-teal" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have copied the password to the device configuration
          </label>
        </div>
      )}
    </Modal>
  );
}
