import { q } from "./db";

export interface Actor {
  id: number | null;
  name: string;
}

export const SYSTEM: Actor = { id: null, name: "System" };

/** Every state-changing action goes through here: who, what, when, target. */
export async function audit(actor: Actor | null, action: string, target: string | null, details?: Record<string, unknown>) {
  try {
    await q("INSERT INTO audit_log(user_id, user_name, action, target, details) VALUES ($1,$2,$3,$4,$5)", [
      actor?.id ?? null,
      actor?.name ?? "Anonymous",
      action,
      target,
      details ? JSON.stringify(details) : null,
    ]);
  } catch (e) {
    console.error("[audit] failed", action, (e as Error).message);
  }
}

/** Build {field: {old, new}} for changed fields only. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { old: before[k], new: after[k] };
  }
  return changes;
}
