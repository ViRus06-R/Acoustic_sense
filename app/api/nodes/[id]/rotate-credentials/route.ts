import { NextResponse } from "next/server";
import { q } from "@/lib/server/db";
import { route, param, notFound, assertSite } from "@/lib/server/http";
import { generateMqttPassword, hashMqttPassword, loadNode, topicsFor } from "@/lib/server/nodes";
import { audit } from "@/lib/server/audit";

export const POST = route({ roles: ["admin"] }, async (_req, { user, params }) => {
  const id = param(params, "id");
  const n = await loadNode(id);
  if (!n || n.decommissioned_at) throw notFound("Node not found");
  assertSite(user, n.site_id);
  const password = generateMqttPassword();
  await q("UPDATE nodes SET mqtt_password_hash = $2 WHERE id = $1", [id, await hashMqttPassword(password)]);
  await audit(user, "node.credentials_rotated", id);
  return NextResponse.json({ credentials: { username: id, password }, topics: await topicsFor(n.slug, id) });
});
