"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const UNAUTHORIZED_EVENT = "as:unauthorized";

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { "x-requested-with": "acoustic-sense" };
  let payload: BodyInit | undefined;
  if (opts.form) payload = opts.form;
  else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method: opts.method ?? (payload ? "POST" : "GET"), headers, body: payload, signal: opts.signal, credentials: "same-origin" });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Cannot reach the server. Check your connection.");
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/auth/login")) window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, (data.error as string) ?? `Request failed (${res.status})`, (data.fields as Record<string, string>) ?? {}, data);
  }
  return data as T;
}

export function qs(params: Record<string, string | number | null | undefined | boolean>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "" && v !== false) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
