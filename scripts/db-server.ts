/**
 * Local PostgreSQL for the demo, without installing Postgres.
 * Runs PGlite (Postgres compiled to WASM) and exposes it on the normal Postgres wire protocol,
 * so the app, the seed script and psql all connect with a standard DATABASE_URL.
 * Data is persisted in ./.data/pg. To use a real Postgres instead, just point DATABASE_URL at it.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pg");
const port = Number(process.env.PGPORT ?? 5432);

async function main() {
  mkdirSync(dataDir, { recursive: true });
  const db = await PGlite.create(dataDir);
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 16 });
  await server.start();
  console.log(`[db] PGlite Postgres listening on 127.0.0.1:${port} (data: ${dataDir})`);
  console.log(`[db] DATABASE_URL=postgres://postgres:postgres@127.0.0.1:${port}/postgres`);
  const stop = async () => {
    console.log("\n[db] stopping...");
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error("[db] failed to start:", e);
  process.exit(1);
});
