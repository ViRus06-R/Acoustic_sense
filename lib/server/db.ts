import { Pool, type PoolClient, types } from "pg";
import { SCHEMA_SQL } from "./schema.sql";

// numeric / int8 -> JS numbers
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));

type G = typeof globalThis & { __asPool?: Pool; __asReady?: Promise<void> };
const g = globalThis as G;

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

export function pool(): Pool {
  if (!g.__asPool) {
    g.__asPool = new Pool({
      connectionString: DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? 4),
      idleTimeoutMillis: 30_000,
    });
    g.__asPool.on("error", (e) => console.error("[db] pool error", e.message));
  }
  return g.__asPool;
}

export function ensureSchema(): Promise<void> {
  if (!g.__asReady) {
    g.__asReady = pool()
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        g.__asReady = undefined;
        throw e;
      });
  }
  return g.__asReady;
}

export type Param = string | number | boolean | null | Date | object | undefined;

export async function q<T = Record<string, unknown>>(sql: string, params: Param[] = []): Promise<T[]> {
  await ensureSchema();
  const r = await pool().query(sql, params as unknown[]);
  return r.rows as T[];
}

export async function q1<T = Record<string, unknown>>(sql: string, params: Param[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
