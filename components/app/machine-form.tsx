"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/client/api";
import { Button, InfoBox } from "@/components/ui/basic";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { MACHINE_TYPES } from "@/lib/shared/domain";
import type { NodeItem, SiteItem } from "@/lib/client/types";

export interface MachineFormValue {
  id?: number;
  name: string;
  type: string;
  siteId: number | null;
  lineId: number | null;
  nodeId: string | null;
  notes: string;
}

export function MachineFormModal({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: MachineFormValue; onSaved?: (id: number) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => api<SiteItem[]>("/api/sites"), enabled: open });
  const nodes = useQuery({ queryKey: ["nodes", "for-form"], queryFn: () => api<{ items: NodeItem[] }>("/api/nodes"), enabled: open });
  const blank: MachineFormValue = { name: "", type: "Pump", siteId: null, lineId: null, nodeId: null, notes: "" };
  const [v, setV] = useState<MachineFormValue>(initial ?? blank);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
      setV(initial ?? blank);
      setFields({});
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // Default to the first site until the user picks one (derived, no effect needed).
  const siteId = v.siteId ?? sites.data?.[0]?.id ?? null;
  const site = sites.data?.find((s) => s.id === siteId);
  const nodeOptions = (nodes.data?.items ?? []).filter((n) => n.site.id === siteId && (!n.machine || n.machine.id === initial?.id));

  const save = useMutation({
    mutationFn: () =>
      api<{ id?: number }>(initial?.id ? `/api/machines/${initial.id}` : "/api/machines", {
        method: initial?.id ? "PATCH" : "POST",
        body: { name: v.name, type: v.type, siteId, lineId: v.lineId, nodeId: v.nodeId, notes: v.notes },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      toast({ tone: "success", title: initial?.id ? "Machine updated" : "Machine added", body: v.name });
      onSaved?.(r.id ?? initial!.id!);
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setFields(e.fields);
        setError(e.message);
      } else setError("Could not save the machine.");
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial?.id ? `Edit ${initial.name}` : "Add machine"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!v.name.trim() || !siteId}>
            {initial?.id ? "Save changes" : "Add machine"}
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-4 max-md:grid-cols-1"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Input label="Name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={fields.name} placeholder="e.g. Pump P-105" />
        <Select label="Type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} error={fields.type}>
          {MACHINE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Select label="Site" value={siteId ?? ""} onChange={(e) => setV({ ...v, siteId: Number(e.target.value), lineId: null, nodeId: null })} error={fields.siteId}>
          {(sites.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select label="Line" value={v.lineId ?? ""} onChange={(e) => setV({ ...v, lineId: e.target.value ? Number(e.target.value) : null })} error={fields.lineId} disabled={!site?.lines.length}>
          <option value="">{site?.lines.length ? "No line" : "This site has no lines"}</option>
          {(site?.lines ?? [])
            .filter((l) => !l.archived)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </Select>
        <Select
          label="Assigned node"
          wrapClassName="col-span-2 max-md:col-span-1"
          value={v.nodeId ?? ""}
          onChange={(e) => setV({ ...v, nodeId: e.target.value || null })}
          error={fields.nodeId}
          hint="Only nodes at this site that are not assigned to another machine are listed."
        >
          <option value="">No node (optional)</option>
          {nodeOptions.map((n) => (
            <option key={n.id} value={n.id}>
              {n.id}
              {n.mountingNote ? ` . ${n.mountingNote}` : ""}
            </option>
          ))}
        </Select>
        <div className="col-span-2 max-md:col-span-1">
          <Textarea label="Notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} error={fields.notes} placeholder="Optional maintenance notes" />
        </div>
        {error && !Object.keys(fields).length && (
          <div className="col-span-2 max-md:col-span-1">
            <InfoBox tone="danger" icon="alert">
              {error}
            </InfoBox>
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
