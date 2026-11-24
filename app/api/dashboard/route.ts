import { NextResponse } from "next/server";
import { q } from "@/lib/server/db";
import { route, scopeSites } from "@/lib/server/http";
import { listMachines, scoreSeries } from "@/lib/server/repo";
import { sortMachines } from "@/lib/shared/domain";

export const GET = route({}, async (req, { user }) => {
  const sp = req.nextUrl.searchParams;
  const siteIds = scopeSites(user, sp.get("site"));
  const lineId = sp.get("line") ? Number(sp.get("line")) : null;
  const machines = sortMachines(await listMachines({ siteIds, lineId }), "severity");
  const kpi = {
    monitored: machines.length,
    healthy: machines.filter((m) => m.status === "Normal").length,
    warning: machines.filter((m) => m.status === "Warning").length,
    anomaly: machines.filter((m) => m.status === "Anomaly").length,
    offline: machines.filter((m) => m.status === "Offline").length,
  };
  const recent = await q(
    `SELECT a.id, a.severity, a.status, a.score, a.threshold, a.detected_at "detectedAt", a.node_id "nodeId", m.name machine, m.id "machineId"
       FROM alerts a LEFT JOIN machines m ON m.id = a.machine_id
      WHERE a.site_id = ANY($1) AND ($2::int IS NULL OR m.line_id = $2)
      ORDER BY a.detected_at DESC LIMIT 6`,
    [siteIds, lineId],
  );
  const nodeIds = machines.map((m) => m.node?.id).filter(Boolean) as string[];
  const series = await scoreSeries(nodeIds, "24h");
  const thresholds = machines.map((m) => m.threshold).filter((t): t is number => t != null);
  const meanThreshold = thresholds.length ? thresholds.reduce((a, b) => a + b, 0) / thresholds.length : 0.045;
  return NextResponse.json({ kpi, machines: machines.slice(0, 9), recentAlerts: recent, fleetSeries: series, threshold: Math.round(meanThreshold * 1000) / 1000 });
});
