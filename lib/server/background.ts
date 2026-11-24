// Starts long-running server jobs once per process: MQTT ingestion and the offline/escalation monitor.
type G = typeof globalThis & { __asBackground?: boolean };
const g = globalThis as G;

export function startBackground() {
  if (g.__asBackground || process.env.AS_DISABLE_BACKGROUND === "1") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  g.__asBackground = true;
  void (async () => {
    const { ensureSchema } = await import("./db");
    const { startMqtt } = await import("./mqtt");
    const { runMonitorTick } = await import("./ingest");
    try {
      await ensureSchema();
    } catch (e) {
      console.error("[background] database not reachable yet:", (e as Error).message);
    }
    startMqtt().catch((e) => console.error("[background] mqtt start failed", e));
    let running = false;
    setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await runMonitorTick();
      } catch (e) {
        console.error("[monitor]", (e as Error).message);
      } finally {
        running = false;
      }
    }, 10_000);
  })();
}
