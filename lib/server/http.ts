import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getSessionUser, type AuthUser } from "./auth";
import { startBackground } from "./background";
import type { Role } from "@/lib/shared/domain";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, fields?: Record<string, string>) => new HttpError(400, msg, fields);
export const notFound = (msg = "Not found") => new HttpError(404, msg);
export const forbidden = (msg = "You do not have access to this resource") => new HttpError(403, msg);

type Params = Record<string, string | string[]>;
interface Ctx {
  user: AuthUser;
  params: Params;
}

export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "acoustic-sense";

function csrfOk(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return true;
  if (req.headers.get(CSRF_HEADER) !== CSRF_VALUE) return false;
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, fields: e.fields }, { status: e.status });
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of e.issues) {
      const k = issue.path.join(".") || "_";
      fields[k] ??= issue.message;
    }
    return NextResponse.json({ error: "Please fix the highlighted fields.", fields }, { status: 400 });
  }
  const err = e as { code?: string; message?: string };
  if (err?.code === "ECONNREFUSED" || err?.code === "57P01") {
    console.error("[api] database unavailable", err.message);
    return NextResponse.json({ error: "Database unavailable. Is `npm run db` running?" }, { status: 503 });
  }
  console.error("[api] unhandled", e);
  return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
}

/** Authenticated route wrapper: session, CSRF, role guard, uniform errors. */
export function route(
  opts: { roles?: Role[] },
  handler: (req: NextRequest, ctx: Ctx) => Promise<Response>,
) {
  return async (req: NextRequest, rc: { params: Promise<Params> }) => {
    try {
      startBackground();
      if (!csrfOk(req)) throw forbidden("Cross-site request blocked");
      const user = await getSessionUser(req);
      if (!user) return NextResponse.json({ error: "Your session expired. Please sign in again." }, { status: 401 });
      if (opts.roles && !opts.roles.includes(user.role)) throw forbidden();
      return await handler(req, { user, params: (await rc?.params) ?? {} });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Public (unauthenticated) route wrapper: CSRF + uniform errors. */
export function publicRoute(handler: (req: NextRequest, params: Params) => Promise<Response>) {
  return async (req: NextRequest, rc: { params: Promise<Params> }) => {
    try {
      startBackground();
      if (!csrfOk(req)) throw forbidden("Cross-site request blocked");
      return await handler(req, (await rc?.params) ?? {});
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest("Invalid JSON body");
  }
  return schema.parse(json);
}

export function param(p: Params, k: string): string {
  const v = p[k];
  return Array.isArray(v) ? v[0] : v;
}

export function intParam(p: Params, k: string): number {
  const n = Number(param(p, k));
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}

// ---- site access ----
export function canSeeSite(user: AuthUser, siteId: number) {
  return user.siteIds.includes(siteId);
}
export function assertSite(user: AuthUser, siteId: number) {
  if (!canSeeSite(user, siteId)) throw forbidden("You do not have access to this site");
}

/** Intersect a requested site filter with the user's access. */
export function scopeSites(user: AuthUser, requested?: string | null): number[] {
  if (requested) {
    const ids = requested.split(",").map(Number).filter(Number.isInteger);
    return ids.filter((id) => user.siteIds.includes(id));
  }
  return user.siteIds;
}
